import Database from 'better-sqlite3';

export function getOwnerId(db) {
  try {
    const ownerRow = db.prepare("SELECT id FROM users WHERE role = 'owner' ORDER BY id ASC LIMIT 1").get();
    if (ownerRow) return ownerRow.id;
    const firstUser = db.prepare("SELECT id FROM users ORDER BY id ASC LIMIT 1").get();
    if (firstUser) return firstUser.id;
  } catch (e) {
    // users table might not exist yet
  }
  return null;
}

export function migrateMultiUserSchema(db) {
  db.exec('PRAGMA foreign_keys = OFF;');

  const ownerId = getOwnerId(db);

  const runMigration = db.transaction(() => {
    // Ensure users table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('owner', 'admin', 'user')),
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'deactivated')),
        cefr_level TEXT DEFAULT 'B1',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const currentOwnerId = getOwnerId(db);

    // 1. user_settings
    const userSettingsCols = db.prepare("PRAGMA table_info(user_settings)").all().map(c => c.name);
    if (userSettingsCols.length > 0 && userSettingsCols.includes('id') && !userSettingsCols.includes('user_id')) {
      db.exec(`
        CREATE TABLE _user_settings_new (
          user_id INTEGER PRIMARY KEY DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
          max_level TEXT DEFAULT 'C2',
          dark_mode INTEGER DEFAULT 0,
          notifications_enabled INTEGER DEFAULT 1,
          external_capture_enabled INTEGER DEFAULT 1,
          raw_text_retention_days INTEGER DEFAULT 7 CHECK(raw_text_retention_days IN (0, 7, 30)),
          allowed_apps TEXT DEFAULT 'ALL',
          denied_apps TEXT DEFAULT '',
          capture_paused INTEGER DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      if (currentOwnerId !== null) {
        db.exec(`
          INSERT INTO _user_settings_new (user_id, max_level, dark_mode, notifications_enabled, created_at)
          SELECT COALESCE(id, ${currentOwnerId}), max_level, dark_mode, notifications_enabled, created_at
          FROM user_settings;
        `);
      }
      db.exec(`
        DROP TABLE user_settings;
        ALTER TABLE _user_settings_new RENAME TO user_settings;
      `);
    } else if (userSettingsCols.length === 0) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_settings (
          user_id INTEGER PRIMARY KEY DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
          max_level TEXT DEFAULT 'C2',
          dark_mode INTEGER DEFAULT 0,
          notifications_enabled INTEGER DEFAULT 1,
          external_capture_enabled INTEGER DEFAULT 1,
          raw_text_retention_days INTEGER DEFAULT 7 CHECK(raw_text_retention_days IN (0, 7, 30)),
          allowed_apps TEXT DEFAULT 'ALL',
          denied_apps TEXT DEFAULT '',
          capture_paused INTEGER DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
    }
    if (currentOwnerId !== null) {
      db.prepare(`
        INSERT OR IGNORE INTO user_settings (user_id, max_level) VALUES (?, 'C2')
      `).run(currentOwnerId);
    }

    // 2. device_tokens
    db.exec(`
      CREATE TABLE IF NOT EXISTS device_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        device_name TEXT NOT NULL,
        app_version TEXT,
        last_used_at TEXT,
        revoked_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);
    `);

    // 3. curriculum_topics & user_topic_progress
    db.exec(`
      CREATE TABLE IF NOT EXISTS curriculum_topics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        category TEXT NOT NULL,
        level TEXT NOT NULL,
        source TEXT DEFAULT 'preset',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_curriculum_level ON curriculum_topics(level);

      CREATE TABLE IF NOT EXISTS user_topic_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
        curriculum_topic_id INTEGER NOT NULL REFERENCES curriculum_topics(id),
        status TEXT NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started', 'insufficient_evidence', 'improving', 'recurring_problem', 'stable', 'mastered')),
        score REAL DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        last_practiced TEXT,
        last_error_at TEXT,
        last_success_at TEXT,
        unique_practice_days INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, curriculum_topic_id)
      );
      CREATE INDEX IF NOT EXISTS idx_user_topic_progress_user ON user_topic_progress(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_topic_progress_status ON user_topic_progress(user_id, status);
    `);

    const currCols = db.prepare("PRAGMA table_info(curriculum_topics)").all().map(c => c.name);
    if (currCols.includes('score') || currCols.includes('success_count') || currCols.includes('failure_count')) {
      if (currentOwnerId !== null) {
        const rowsToMigrate = db.prepare(`
          SELECT id, status, score, success_count, failure_count, last_practiced
          FROM curriculum_topics
          WHERE status != 'not_started' OR score != 0 OR success_count != 0 OR failure_count != 0 OR last_practiced IS NOT NULL
        `).all();

        for (const row of rowsToMigrate) {
          let mappedStatus = 'improving';
          if (row.failure_count > 1) {
            mappedStatus = 'recurring_problem';
          } else if (row.failure_count > 0 || row.success_count > 0) {
            mappedStatus = 'improving';
          } else {
            mappedStatus = 'insufficient_evidence';
          }
          db.prepare(`
            INSERT OR IGNORE INTO user_topic_progress
            (user_id, curriculum_topic_id, status, score, success_count, error_count, last_practiced)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(currentOwnerId, row.id, mappedStatus, row.score || 0, row.success_count || 0, row.failure_count || 0, row.last_practiced);
        }
      }

      const hasSource = currCols.includes('source');
      const sourceExpr = hasSource ? "COALESCE(source, 'preset')" : "'preset'";

      db.exec(`
        CREATE TABLE _curriculum_topics_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          category TEXT NOT NULL,
          level TEXT NOT NULL,
          source TEXT DEFAULT 'preset',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO _curriculum_topics_new (id, name, category, level, source, created_at)
        SELECT id, name, category, level, ${sourceExpr}, created_at FROM curriculum_topics;
        DROP TABLE curriculum_topics;
        ALTER TABLE _curriculum_topics_new RENAME TO curriculum_topics;
        CREATE INDEX IF NOT EXISTS idx_curriculum_level ON curriculum_topics(level);
      `);
    }

    // 4. writing_samples
    const wsCols = db.prepare("PRAGMA table_info(writing_samples)").all().map(c => c.name);
    if (wsCols.length > 0 && !wsCols.includes('user_id')) {
      db.exec(`
        CREATE TABLE _writing_samples_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
          device_token_id INTEGER REFERENCES device_tokens(id),
          event_id TEXT NOT NULL,
          source_app TEXT NOT NULL,
          original_text TEXT,
          sent_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing', 'completed', 'failed')),
          accepted INTEGER DEFAULT 1,
          rejection_reason TEXT,
          preview_only INTEGER DEFAULT 0,
          analysis_json TEXT,
          retention_purged INTEGER DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          analyzed_at TEXT,
          UNIQUE(user_id, event_id)
        );
      `);
      if (currentOwnerId !== null) {
        db.exec(`
          INSERT INTO _writing_samples_new (
            id, user_id, event_id, source_app, original_text, sent_at, status, accepted, rejection_reason, preview_only, analysis_json, created_at, analyzed_at
          )
          SELECT
            id, ${currentOwnerId}, event_id, source_app, original_text, sent_at, status, COALESCE(accepted, 1), rejection_reason, 0, analysis_json, created_at, analyzed_at
          FROM writing_samples;
        `);
      }
      db.exec(`
        DROP TABLE writing_samples;
        ALTER TABLE _writing_samples_new RENAME TO writing_samples;
        CREATE INDEX IF NOT EXISTS idx_writing_samples_user ON writing_samples(user_id);
        CREATE INDEX IF NOT EXISTS idx_writing_samples_user_sent ON writing_samples(user_id, sent_at);
        CREATE INDEX IF NOT EXISTS idx_writing_samples_status ON writing_samples(status);
      `);
    } else if (wsCols.length === 0) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS writing_samples (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
          device_token_id INTEGER REFERENCES device_tokens(id),
          event_id TEXT NOT NULL,
          source_app TEXT NOT NULL,
          original_text TEXT,
          sent_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing', 'completed', 'failed')),
          accepted INTEGER DEFAULT 1,
          rejection_reason TEXT,
          preview_only INTEGER DEFAULT 0,
          analysis_json TEXT,
          retention_purged INTEGER DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          analyzed_at TEXT,
          UNIQUE(user_id, event_id)
        );
        CREATE INDEX IF NOT EXISTS idx_writing_samples_user ON writing_samples(user_id);
        CREATE INDEX IF NOT EXISTS idx_writing_samples_user_sent ON writing_samples(user_id, sent_at);
        CREATE INDEX IF NOT EXISTS idx_writing_samples_status ON writing_samples(status);
      `);
    }

    // 5. grammar_evidence
    const geCols = db.prepare("PRAGMA table_info(grammar_evidence)").all().map(c => c.name);
    if (geCols.length > 0 && !geCols.includes('user_id')) {
      db.exec(`
        CREATE TABLE _grammar_evidence_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
          writing_sample_id INTEGER NOT NULL REFERENCES writing_samples(id) ON DELETE CASCADE,
          curriculum_topic_id INTEGER NOT NULL REFERENCES curriculum_topics(id),
          outcome TEXT NOT NULL CHECK(outcome IN ('success', 'error')),
          confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
          explanation_ru TEXT NOT NULL,
          score_delta REAL NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(writing_sample_id, curriculum_topic_id)
        );
      `);
      if (currentOwnerId !== null) {
        db.exec(`
          INSERT INTO _grammar_evidence_new (
            id, user_id, writing_sample_id, curriculum_topic_id, outcome, confidence, explanation_ru, score_delta, created_at
          )
          SELECT
            ge.id, COALESCE(ws.user_id, ${currentOwnerId}), ge.writing_sample_id, ge.curriculum_topic_id, ge.outcome, ge.confidence, ge.explanation_ru, ge.score_delta, ge.created_at
          FROM grammar_evidence ge
          LEFT JOIN writing_samples ws ON ge.writing_sample_id = ws.id;
        `);
      }
      db.exec(`
        DROP TABLE grammar_evidence;
        ALTER TABLE _grammar_evidence_new RENAME TO grammar_evidence;
        CREATE INDEX IF NOT EXISTS idx_grammar_evidence_user ON grammar_evidence(user_id);
        CREATE INDEX IF NOT EXISTS idx_grammar_evidence_topic ON grammar_evidence(curriculum_topic_id, created_at);
      `);
    } else if (geCols.length === 0) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS grammar_evidence (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
          writing_sample_id INTEGER NOT NULL REFERENCES writing_samples(id) ON DELETE CASCADE,
          curriculum_topic_id INTEGER NOT NULL REFERENCES curriculum_topics(id),
          outcome TEXT NOT NULL CHECK(outcome IN ('success', 'error')),
          confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
          explanation_ru TEXT NOT NULL,
          score_delta REAL NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(writing_sample_id, curriculum_topic_id)
        );
        CREATE INDEX IF NOT EXISTS idx_grammar_evidence_user ON grammar_evidence(user_id);
        CREATE INDEX IF NOT EXISTS idx_grammar_evidence_topic ON grammar_evidence(curriculum_topic_id, created_at);
      `);
    }

    // 6. correction_feedback
    db.exec(`
      CREATE TABLE IF NOT EXISTS correction_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
        writing_sample_id INTEGER NOT NULL REFERENCES writing_samples(id) ON DELETE CASCADE,
        feedback_type TEXT NOT NULL CHECK(feedback_type IN ('helpful', 'wrong_correction', 'explanation_unclear', 'ignore_type', 'undo_progress')),
        notes TEXT,
        undone_evidence_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, writing_sample_id, feedback_type)
      );
      CREATE INDEX IF NOT EXISTS idx_correction_feedback_user ON correction_feedback(user_id);
    `);

    // 7. practice_sessions
    db.exec(`
      CREATE TABLE IF NOT EXISTS practice_sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'completed')),
        topics_json TEXT NOT NULL,
        exercises_json TEXT NOT NULL,
        user_answers_json TEXT DEFAULT '[]',
        results_json TEXT DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_practice_sessions_user ON practice_sessions(user_id);
    `);

    // 8. chat_history
    const chCols = db.prepare("PRAGMA table_info(chat_history)").all().map(c => c.name);
    if (chCols.length > 0 && !chCols.includes('user_id')) {
      db.exec(`
        CREATE TABLE _chat_history_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
          content TEXT NOT NULL,
          timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      if (currentOwnerId !== null) {
        db.exec(`
          INSERT INTO _chat_history_new (id, user_id, role, content, timestamp)
          SELECT id, ${currentOwnerId}, role, content, timestamp FROM chat_history;
        `);
      }
      db.exec(`
        DROP TABLE chat_history;
        ALTER TABLE _chat_history_new RENAME TO chat_history;
        CREATE INDEX IF NOT EXISTS idx_chat_history_user_ts ON chat_history(user_id, timestamp);
      `);
    } else if (chCols.length === 0) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
          content TEXT NOT NULL,
          timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_chat_history_user_ts ON chat_history(user_id, timestamp);
      `);
    }

    // 9. chat_requests
    const crCols = db.prepare("PRAGMA table_info(chat_requests)").all().map(c => c.name);
    if (crCols.length > 0 && !crCols.includes('user_id')) {
      db.exec(`
        CREATE TABLE _chat_requests_new (
          message_id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
          request_text TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing', 'completed')),
          response_json TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at TEXT
        );
      `);
      if (currentOwnerId !== null) {
        db.exec(`
          INSERT INTO _chat_requests_new (message_id, user_id, request_text, status, response_json, created_at, completed_at)
          SELECT message_id, ${currentOwnerId}, request_text, status, response_json, created_at, completed_at FROM chat_requests;
        `);
      }
      db.exec(`
        DROP TABLE chat_requests;
        ALTER TABLE _chat_requests_new RENAME TO chat_requests;
        CREATE INDEX IF NOT EXISTS idx_chat_requests_user ON chat_requests(user_id);
      `);
    } else if (crCols.length === 0) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_requests (
          message_id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
          request_text TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing', 'completed')),
          response_json TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_chat_requests_user ON chat_requests(user_id);
      `);
    }

    // 10. vocabulary
    const vCols = db.prepare("PRAGMA table_info(vocabulary)").all().map(c => c.name);
    if (vCols.length > 0 && !vCols.includes('user_id')) {
      db.exec(`
        CREATE TABLE _vocabulary_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
          word TEXT NOT NULL,
          normalized_word TEXT NOT NULL,
          translation TEXT NOT NULL,
          example TEXT,
          level INTEGER DEFAULT 0,
          next_review TEXT DEFAULT CURRENT_TIMESTAMP,
          review_count INTEGER DEFAULT 0,
          last_reviewed TEXT,
          source TEXT DEFAULT 'manual',
          writing_sample_id INTEGER REFERENCES writing_samples(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, normalized_word)
        );
      `);
      if (currentOwnerId !== null) {
        db.exec(`
          INSERT INTO _vocabulary_new (
            id, user_id, word, normalized_word, translation, example, level, next_review, review_count, last_reviewed, source, created_at
          )
          SELECT
            id, ${currentOwnerId}, word, LOWER(TRIM(word)), translation, example, level, next_review, review_count, last_reviewed, 'manual', created_at
          FROM vocabulary;
        `);
      }
      db.exec(`
        DROP TABLE vocabulary;
        ALTER TABLE _vocabulary_new RENAME TO vocabulary;
        CREATE INDEX IF NOT EXISTS idx_vocabulary_user ON vocabulary(user_id);
        CREATE INDEX IF NOT EXISTS idx_vocabulary_next_review ON vocabulary(user_id, next_review);
      `);
    } else if (vCols.length === 0) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS vocabulary (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
          word TEXT NOT NULL,
          normalized_word TEXT NOT NULL,
          translation TEXT NOT NULL,
          example TEXT,
          level INTEGER DEFAULT 0,
          next_review TEXT DEFAULT CURRENT_TIMESTAMP,
          review_count INTEGER DEFAULT 0,
          last_reviewed TEXT,
          source TEXT DEFAULT 'manual',
          writing_sample_id INTEGER REFERENCES writing_samples(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, normalized_word)
        );
        CREATE INDEX IF NOT EXISTS idx_vocabulary_user ON vocabulary(user_id);
        CREATE INDEX IF NOT EXISTS idx_vocabulary_next_review ON vocabulary(user_id, next_review);
      `);
    }

    // 11. achievements
    const achCols = db.prepare("PRAGMA table_info(achievements)").all().map(c => c.name);
    if (achCols.length > 0 && !achCols.includes('user_id')) {
      db.exec(`
        CREATE TABLE _achievements_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT,
          icon TEXT,
          earned_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, name)
        );
      `);
      if (currentOwnerId !== null) {
        db.exec(`
          INSERT INTO _achievements_new (id, user_id, name, description, icon, earned_at)
          SELECT id, ${currentOwnerId}, name, description, icon, earned_at FROM achievements;
        `);
      }
      db.exec(`
        DROP TABLE achievements;
        ALTER TABLE _achievements_new RENAME TO achievements;
        CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id);
      `);
    } else if (achCols.length === 0) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS achievements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 1 REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT,
          icon TEXT,
          earned_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, name)
        );
        CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id);
      `);
    }

    // 12. analytics_events
    db.exec(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        event_name TEXT NOT NULL,
        properties_json TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id);
    `);

    // 13. Drop deprecated single-user topics table
    db.exec('DROP TABLE IF EXISTS topics;');
  });

  runMigration();

  db.exec('PRAGMA foreign_keys = ON;');
  const fkErrors = db.prepare('PRAGMA foreign_key_check;').all();
  if (fkErrors.length > 0) {
    throw new Error('Foreign key violations detected after multi-user migration: ' + JSON.stringify(fkErrors));
  }
}
