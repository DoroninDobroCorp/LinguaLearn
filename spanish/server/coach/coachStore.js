// SQLite persistence for the conversation coach. The coach keeps its own tables
// and never writes to the A1 course mastery tables: conversation is a separate,
// self-paced track with its own evidence model.

import { getTaxonomySpot, normalizeSpotKey } from './coachTaxonomy.js';

export const LEARNING_TRACK_CONVERSATION = 'conversation';

const MEMORY_LIMIT = 30;
const NEW_SPOT_SCORE = 45;

function hasColumn(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

export function ensureCoachSchema(db) {
  if (!hasColumn(db, 'profiles', 'learning_track')) {
    db.exec('ALTER TABLE profiles ADD COLUMN learning_track TEXT');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS coach_learners (
      profile_id INTEGER PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
      display_name TEXT,
      cefr_level TEXT NOT NULL DEFAULT 'B1',
      dialect TEXT NOT NULL DEFAULT 'rioplatense',
      interests_json TEXT NOT NULL DEFAULT '[]',
      goals_json TEXT NOT NULL DEFAULT '[]',
      about TEXT,
      partner_voice TEXT NOT NULL DEFAULT 'Sulafat',
      voice_autoplay INTEGER NOT NULL DEFAULT 1,
      show_inline_feedback INTEGER NOT NULL DEFAULT 1,
      memory_json TEXT NOT NULL DEFAULT '[]',
      onboarded_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS coach_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      mode TEXT NOT NULL DEFAULT 'chat',
      topic_id TEXT,
      scenario_id TEXT,
      focus_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ended_at TEXT,
      analysis_json TEXT,
      analysis_error TEXT,
      stats_json TEXT,
      workout_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_coach_sessions_profile ON coach_sessions(profile_id, started_at);

    CREATE TABLE IF NOT EXISTS coach_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES coach_sessions(id) ON DELETE CASCADE,
      profile_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      input_mode TEXT NOT NULL DEFAULT 'text',
      feedback_json TEXT,
      translation_ru TEXT,
      audio_seconds REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_coach_messages_session ON coach_messages(session_id, id);

    CREATE TABLE IF NOT EXISTS coach_weak_spots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      spot_key TEXT NOT NULL,
      title_ru TEXT NOT NULL,
      title_es TEXT,
      category TEXT NOT NULL DEFAULT 'grammar',
      description_ru TEXT,
      lesson_json TEXT,
      score INTEGER NOT NULL DEFAULT ${NEW_SPOT_SCORE},
      error_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      drill_correct INTEGER NOT NULL DEFAULT 0,
      drill_wrong INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_practiced_at TEXT,
      UNIQUE(profile_id, spot_key)
    );

    CREATE TABLE IF NOT EXISTS coach_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      weak_spot_id INTEGER REFERENCES coach_weak_spots(id) ON DELETE CASCADE,
      session_id INTEGER REFERENCES coach_sessions(id) ON DELETE SET NULL,
      kind TEXT NOT NULL DEFAULT 'error',
      original TEXT,
      corrected TEXT,
      explanation_ru TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_coach_evidence_spot ON coach_evidence(weak_spot_id, kind, created_at);

    CREATE TABLE IF NOT EXISTS coach_workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      session_id INTEGER,
      spot_keys_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'generating',
      items_json TEXT NOT NULL DEFAULT '[]',
      results_json TEXT NOT NULL DEFAULT '{}',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_coach_workouts_profile ON coach_workouts(profile_id, created_at);
  `);

  // Learner-defined topic or role-play scenario for a session.
  if (!hasColumn(db, 'coach_sessions', 'custom_json')) {
    db.exec('ALTER TABLE coach_sessions ADD COLUMN custom_json TEXT');
  }
}

export function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function nowIso() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------- learners

export function getLearner(db, profileId) {
  const row = db.prepare('SELECT * FROM coach_learners WHERE profile_id = ?').get(profileId);
  const profile = db.prepare('SELECT id, name FROM profiles WHERE id = ?').get(profileId);
  if (!profile) return null;
  if (!row) {
    return {
      profile_id: profileId,
      display_name: profile.name,
      cefr_level: 'B1',
      dialect: 'rioplatense',
      interests: [],
      goals: [],
      about: '',
      partner_voice: 'Sulafat',
      voice_autoplay: true,
      show_inline_feedback: true,
      memory: [],
      onboarded: false,
      exists: false,
    };
  }
  return {
    profile_id: row.profile_id,
    display_name: row.display_name || profile.name,
    cefr_level: row.cefr_level,
    dialect: row.dialect,
    interests: parseJson(row.interests_json, []),
    goals: parseJson(row.goals_json, []),
    about: row.about || '',
    partner_voice: row.partner_voice,
    voice_autoplay: Boolean(row.voice_autoplay),
    show_inline_feedback: Boolean(row.show_inline_feedback),
    memory: parseJson(row.memory_json, []),
    onboarded: Boolean(row.onboarded_at),
    exists: true,
  };
}

const LEARNER_FIELDS = {
  display_name: (value) => String(value || '').trim().slice(0, 40) || null,
  cefr_level: (value) => (['A2', 'B1', 'B2', 'C1'].includes(value) ? value : 'B1'),
  interests: (value) => (Array.isArray(value) ? value.map((item) => String(item).trim().slice(0, 60)).filter(Boolean).slice(0, 20) : []),
  goals: (value) => (Array.isArray(value) ? value.map((item) => String(item).trim().slice(0, 120)).filter(Boolean).slice(0, 10) : []),
  about: (value) => String(value || '').trim().slice(0, 800),
  partner_voice: (value) => (/^[A-Za-z]{2,24}$/.test(String(value || '')) ? String(value) : 'Sulafat'),
  voice_autoplay: (value) => (value ? 1 : 0),
  show_inline_feedback: (value) => (value ? 1 : 0),
};

export function upsertLearner(db, profileId, patch = {}, { markOnboarded = false } = {}) {
  const current = getLearner(db, profileId);
  if (!current) return null;
  const merged = {
    display_name: current.display_name,
    cefr_level: current.cefr_level,
    interests: current.interests,
    goals: current.goals,
    about: current.about,
    partner_voice: current.partner_voice,
    voice_autoplay: current.voice_autoplay,
    show_inline_feedback: current.show_inline_feedback,
  };
  for (const [field, sanitize] of Object.entries(LEARNER_FIELDS)) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      merged[field] = sanitize(patch[field]);
    }
  }
  const values = {
    profile_id: profileId,
    display_name: merged.display_name,
    cefr_level: merged.cefr_level,
    interests_json: JSON.stringify(merged.interests || []),
    goals_json: JSON.stringify(merged.goals || []),
    about: merged.about || '',
    partner_voice: merged.partner_voice || 'Sulafat',
    voice_autoplay: merged.voice_autoplay ? 1 : 0,
    show_inline_feedback: merged.show_inline_feedback ? 1 : 0,
    updated_at: nowIso(),
  };
  db.prepare(`
    INSERT INTO coach_learners (profile_id, display_name, cefr_level, interests_json, goals_json, about, partner_voice, voice_autoplay, show_inline_feedback, updated_at)
    VALUES (@profile_id, @display_name, @cefr_level, @interests_json, @goals_json, @about, @partner_voice, @voice_autoplay, @show_inline_feedback, @updated_at)
    ON CONFLICT(profile_id) DO UPDATE SET
      display_name = excluded.display_name,
      cefr_level = excluded.cefr_level,
      interests_json = excluded.interests_json,
      goals_json = excluded.goals_json,
      about = excluded.about,
      partner_voice = excluded.partner_voice,
      voice_autoplay = excluded.voice_autoplay,
      show_inline_feedback = excluded.show_inline_feedback,
      updated_at = excluded.updated_at
  `).run(values);
  if (markOnboarded) {
    db.prepare('UPDATE coach_learners SET onboarded_at = COALESCE(onboarded_at, ?) WHERE profile_id = ?').run(nowIso(), profileId);
  }
  return getLearner(db, profileId);
}

export function addLearnerMemory(db, profileId, facts) {
  const learner = getLearner(db, profileId);
  if (!learner?.exists || !Array.isArray(facts) || !facts.length) return [];
  const memory = learner.memory.slice();
  const seen = new Set(memory.map((fact) => fact.toLowerCase()));
  const added = [];
  for (const raw of facts) {
    const fact = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (fact.length < 6 || seen.has(fact.toLowerCase())) continue;
    seen.add(fact.toLowerCase());
    memory.push(fact);
    added.push(fact);
  }
  const trimmed = memory.slice(-MEMORY_LIMIT);
  db.prepare('UPDATE coach_learners SET memory_json = ?, updated_at = ? WHERE profile_id = ?').run(JSON.stringify(trimmed), nowIso(), profileId);
  return added;
}

export function removeLearnerMemory(db, profileId, index) {
  const learner = getLearner(db, profileId);
  if (!learner?.exists) return [];
  const memory = learner.memory.filter((_, position) => position !== index);
  db.prepare('UPDATE coach_learners SET memory_json = ?, updated_at = ? WHERE profile_id = ?').run(JSON.stringify(memory), nowIso(), profileId);
  return memory;
}

export function setProfileLearningTrack(db, profileId, track) {
  db.prepare('UPDATE profiles SET learning_track = ? WHERE id = ?').run(track || null, profileId);
}

// ---------------------------------------------------------------- sessions

export function createSession(db, profileId, { mode, topicId, scenarioId, focusKeys, custom = null }) {
  const result = db.prepare(`
    INSERT INTO coach_sessions (profile_id, mode, topic_id, scenario_id, focus_json, status, started_at, custom_json)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(profileId, mode, topicId || null, scenarioId || null, JSON.stringify(focusKeys || []), nowIso(), custom ? JSON.stringify(custom) : null);
  return getSession(db, profileId, result.lastInsertRowid);
}

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    profile_id: row.profile_id,
    mode: row.mode,
    topic_id: row.topic_id,
    scenario_id: row.scenario_id,
    custom: parseJson(row.custom_json, null),
    focus_keys: parseJson(row.focus_json, []),
    status: row.status,
    started_at: row.started_at,
    ended_at: row.ended_at,
    analysis: parseJson(row.analysis_json, null),
    analysis_error: row.analysis_error,
    stats: parseJson(row.stats_json, null),
    workout_id: row.workout_id,
  };
}

export function getSession(db, profileId, sessionId) {
  return mapSession(db.prepare('SELECT * FROM coach_sessions WHERE id = ? AND profile_id = ?').get(sessionId, profileId));
}

export function listSessions(db, profileId, limit = 20) {
  return db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM coach_messages m WHERE m.session_id = s.id AND m.role = 'user') AS user_messages
    FROM coach_sessions s
    WHERE s.profile_id = ?
    ORDER BY s.started_at DESC
    LIMIT ?
  `).all(profileId, limit).map((row) => ({ ...mapSession(row), user_messages: row.user_messages }));
}

/** Most recent distinct learner-defined topics and scenarios, for one-tap reuse. */
export function listRecentCustom(db, profileId, limit = 5) {
  const rows = db.prepare(`
    SELECT custom_json FROM coach_sessions
    WHERE profile_id = ? AND custom_json IS NOT NULL
    ORDER BY started_at DESC LIMIT 60
  `).all(profileId);
  const topics = [];
  const scenarios = [];
  const seen = new Set();
  for (const row of rows) {
    const custom = parseJson(row.custom_json, null);
    if (!custom) continue;
    const key = JSON.stringify(custom).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (custom.topic && topics.length < limit) topics.push(custom.topic);
    if (custom.scenario && scenarios.length < limit) scenarios.push(custom.scenario);
  }
  return { topics, scenarios };
}

export function updateSession(db, sessionId, fields) {
  const allowed = ['status', 'ended_at', 'analysis_json', 'analysis_error', 'stats_json', 'workout_id'];
  const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
  if (!entries.length) return;
  const sql = `UPDATE coach_sessions SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...entries.map(([, value]) => value), sessionId);
}

// ---------------------------------------------------------------- messages

function mapMessage(row) {
  return {
    id: row.id,
    session_id: row.session_id,
    role: row.role,
    content: row.content,
    input_mode: row.input_mode,
    feedback: parseJson(row.feedback_json, null),
    translation_ru: row.translation_ru || null,
    audio_seconds: row.audio_seconds,
    created_at: row.created_at,
  };
}

export function addMessage(db, { sessionId, profileId, role, content, inputMode = 'text', audioSeconds = null }) {
  const result = db.prepare(`
    INSERT INTO coach_messages (session_id, profile_id, role, content, input_mode, audio_seconds, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(sessionId, profileId, role, content, inputMode, audioSeconds, nowIso());
  return getMessage(db, result.lastInsertRowid);
}

export function getMessage(db, messageId) {
  const row = db.prepare('SELECT * FROM coach_messages WHERE id = ?').get(messageId);
  return row ? mapMessage(row) : null;
}

export function listMessages(db, sessionId) {
  return db.prepare('SELECT * FROM coach_messages WHERE session_id = ? ORDER BY id').all(sessionId).map(mapMessage);
}

export function setMessageFeedback(db, messageId, feedback) {
  db.prepare('UPDATE coach_messages SET feedback_json = ? WHERE id = ?').run(JSON.stringify(feedback), messageId);
}

export function setMessageTranslation(db, messageId, translation) {
  db.prepare('UPDATE coach_messages SET translation_ru = ? WHERE id = ?').run(translation, messageId);
}

// -------------------------------------------------------------- weak spots

function statusForSpot(spot) {
  const practiceWins = spot.success_count + spot.drill_correct;
  if (spot.score >= 85 && practiceWins >= 6) return 'mastered';
  if (spot.score >= 60) return 'improving';
  return 'active';
}

function mapSpot(row) {
  if (!row) return null;
  return {
    id: row.id,
    spot_key: row.spot_key,
    title_ru: row.title_ru,
    title_es: row.title_es,
    category: row.category,
    description_ru: row.description_ru,
    lesson: parseJson(row.lesson_json, null),
    score: row.score,
    error_count: row.error_count,
    success_count: row.success_count,
    drill_correct: row.drill_correct,
    drill_wrong: row.drill_wrong,
    status: row.status,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    last_practiced_at: row.last_practiced_at,
  };
}

export function listSpots(db, profileId, { includeArchived = false } = {}) {
  const rows = db.prepare(`
    SELECT * FROM coach_weak_spots
    WHERE profile_id = ? ${includeArchived ? '' : "AND status != 'archived'"}
    ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'improving' THEN 1 WHEN 'mastered' THEN 2 ELSE 3 END, score ASC, error_count DESC
  `).all(profileId);
  return rows.map(mapSpot);
}

export function getSpot(db, profileId, spotId) {
  return mapSpot(db.prepare('SELECT * FROM coach_weak_spots WHERE id = ? AND profile_id = ?').get(spotId, profileId));
}

export function getSpotByKey(db, profileId, spotKey) {
  return mapSpot(db.prepare('SELECT * FROM coach_weak_spots WHERE spot_key = ? AND profile_id = ?').get(spotKey, profileId));
}

export function ensureSpot(db, profileId, { spot_key, title_ru, title_es, category, description_ru }) {
  const key = normalizeSpotKey(spot_key);
  const reference = getTaxonomySpot(key);
  const existing = getSpotByKey(db, profileId, key);
  if (existing) {
    if (description_ru && description_ru.length > 10) {
      db.prepare('UPDATE coach_weak_spots SET description_ru = ? WHERE id = ?').run(String(description_ru).slice(0, 600), existing.id);
    }
    if (existing.status === 'archived') {
      db.prepare("UPDATE coach_weak_spots SET status = 'active' WHERE id = ?").run(existing.id);
    }
    return getSpot(db, profileId, existing.id);
  }
  const result = db.prepare(`
    INSERT INTO coach_weak_spots (profile_id, spot_key, title_ru, title_es, category, description_ru, score, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    profileId,
    key,
    String(reference?.title_ru || title_ru || key).slice(0, 120),
    String(reference?.title_es || title_es || '').slice(0, 160),
    ['grammar', 'vocabulary', 'usage', 'avoidance'].includes(category) ? category : (reference?.category || 'grammar'),
    description_ru ? String(description_ru).slice(0, 600) : null,
    NEW_SPOT_SCORE,
    nowIso(),
    nowIso(),
  );
  return getSpot(db, profileId, result.lastInsertRowid);
}

const SEVERITY_WEIGHT = { high: 1, medium: 0.75, low: 0.4 };

/**
 * Apply one piece of evidence to a weak spot and return the score delta.
 * kind: conversation_error | conversation_success | drill_correct | drill_almost | drill_wrong
 */
export function applySpotEvidence(db, spotId, kind, { severity = 'medium' } = {}) {
  const spot = db.prepare('SELECT * FROM coach_weak_spots WHERE id = ?').get(spotId);
  if (!spot) return 0;
  let delta = 0;
  const next = { ...spot };
  const stamp = nowIso();
  switch (kind) {
    case 'conversation_error':
      delta = -Math.round(8 * (SEVERITY_WEIGHT[severity] ?? 0.75));
      next.error_count += 1;
      next.last_seen_at = stamp;
      break;
    case 'conversation_success':
      delta = 7;
      next.success_count += 1;
      break;
    case 'drill_correct':
      delta = 5;
      next.drill_correct += 1;
      next.last_practiced_at = stamp;
      break;
    case 'drill_almost':
      delta = 2;
      next.drill_correct += 1;
      next.last_practiced_at = stamp;
      break;
    case 'drill_wrong':
      delta = -4;
      next.drill_wrong += 1;
      next.last_practiced_at = stamp;
      break;
    default:
      return 0;
  }
  next.score = Math.max(0, Math.min(100, spot.score + delta));
  next.status = statusForSpot(next);
  db.prepare(`
    UPDATE coach_weak_spots
    SET score = ?, status = ?, error_count = ?, success_count = ?, drill_correct = ?, drill_wrong = ?, last_seen_at = ?, last_practiced_at = ?
    WHERE id = ?
  `).run(next.score, next.status, next.error_count, next.success_count, next.drill_correct, next.drill_wrong, next.last_seen_at, next.last_practiced_at, spotId);
  return next.score - spot.score;
}

export function addEvidence(db, { profileId, spotId, sessionId, kind, original, corrected, explanation }) {
  db.prepare(`
    INSERT INTO coach_evidence (profile_id, weak_spot_id, session_id, kind, original, corrected, explanation_ru, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(profileId, spotId, sessionId || null, kind, original ? String(original).slice(0, 400) : null, corrected ? String(corrected).slice(0, 400) : null, explanation ? String(explanation).slice(0, 400) : null, nowIso());
}

export function listEvidence(db, spotId, { kind = 'error', limit = 8 } = {}) {
  return db.prepare(`
    SELECT original, corrected, explanation_ru, created_at, session_id
    FROM coach_evidence WHERE weak_spot_id = ? AND kind = ?
    ORDER BY id DESC LIMIT ?
  `).all(spotId, kind, limit);
}

export function setSpotLesson(db, spotId, lesson) {
  db.prepare('UPDATE coach_weak_spots SET lesson_json = ? WHERE id = ?').run(JSON.stringify(lesson), spotId);
}

export function archiveSpot(db, profileId, spotId) {
  db.prepare("UPDATE coach_weak_spots SET status = 'archived' WHERE id = ? AND profile_id = ?").run(spotId, profileId);
}

/** Weak spots ordered by how much they need attention right now. */
export function prioritizedSpots(db, profileId, limit = 3) {
  const now = Date.now();
  return listSpots(db, profileId)
    .filter((spot) => spot.status !== 'mastered')
    .map((spot) => {
      const seenDaysAgo = (now - Date.parse(spot.last_seen_at || spot.first_seen_at)) / 86_400_000;
      const practicedHoursAgo = spot.last_practiced_at ? (now - Date.parse(spot.last_practiced_at)) / 3_600_000 : Infinity;
      let priority = (100 - spot.score) + Math.min(spot.error_count, 10) * 3;
      if (seenDaysAgo < 7) priority += 15;
      if (practicedHoursAgo < 12) priority -= 25;
      return { ...spot, priority };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}

// ---------------------------------------------------------------- workouts

function mapWorkout(row) {
  if (!row) return null;
  return {
    id: row.id,
    session_id: row.session_id,
    spot_keys: parseJson(row.spot_keys_json, []),
    status: row.status,
    items: parseJson(row.items_json, []),
    results: parseJson(row.results_json, {}),
    error: row.error,
    created_at: row.created_at,
    completed_at: row.completed_at,
  };
}

export function createWorkoutRow(db, profileId, { sessionId, spotKeys }) {
  const result = db.prepare(`
    INSERT INTO coach_workouts (profile_id, session_id, spot_keys_json, status, created_at)
    VALUES (?, ?, ?, 'generating', ?)
  `).run(profileId, sessionId || null, JSON.stringify(spotKeys), nowIso());
  return result.lastInsertRowid;
}

export function getWorkout(db, profileId, workoutId) {
  return mapWorkout(db.prepare('SELECT * FROM coach_workouts WHERE id = ? AND profile_id = ?').get(workoutId, profileId));
}

export function latestOpenWorkout(db, profileId) {
  return mapWorkout(db.prepare(`
    SELECT * FROM coach_workouts
    WHERE profile_id = ? AND status IN ('ready', 'generating')
    ORDER BY id DESC LIMIT 1
  `).get(profileId));
}

export function listWorkouts(db, profileId, limit = 10) {
  return db.prepare('SELECT * FROM coach_workouts WHERE profile_id = ? ORDER BY id DESC LIMIT ?').all(profileId, limit).map(mapWorkout);
}

export function updateWorkout(db, workoutId, fields) {
  const allowed = ['status', 'items_json', 'results_json', 'error', 'completed_at'];
  const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
  if (!entries.length) return;
  db.prepare(`UPDATE coach_workouts SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`).run(...entries.map(([, value]) => value), workoutId);
}
