/**
 * LinguaLearn English - First-Party Privacy-Safe Analytics Telemetry & Admin Metrics
 */

const SENSITIVE_KEY_PATTERNS = [
  'password',
  'password_hash',
  'passwordhash',
  'token',
  'token_hash',
  'tokenhash',
  'secret',
  'authorization',
  'cookie',
  'lingua_session',
  'sessionid',
  'session_id',
  'originaltext',
  'original_text',
  'correctedtext',
  'corrected_text',
  'message',
  'content',
  'text',
  'rawtext',
  'raw_text',
  'notes',
  'example',
  'email'
];

/**
 * Sanitize properties to prevent logging raw user text, passwords, or tokens.
 */
export function sanitizeTelemetryProperties(properties) {
  if (!properties || typeof properties !== 'object') {
    return {};
  }

  if (Array.isArray(properties)) {
    return properties.map(item => sanitizeTelemetryProperties(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(properties)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEY_PATTERNS.some(p => lowerKey === p || lowerKey.includes(p));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeTelemetryProperties(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Log a privacy-safe telemetry event into analytics_events table.
 */
export function logAnalyticsEvent(db, userId, eventName, properties = {}) {
  if (!db || !eventName) return null;

  try {
    const sanitizedProps = sanitizeTelemetryProperties(properties);
    const propsJson = JSON.stringify(sanitizedProps);
    const validUserId = (typeof userId === 'number' && userId > 0) ? userId : null;

    const stmt = db.prepare(`
      INSERT INTO analytics_events (user_id, event_name, properties_json)
      VALUES (?, ?, ?)
    `);
    return stmt.run(validUserId, String(eventName).trim(), propsJson);
  } catch (error) {
    console.error('Failed to log analytics telemetry event:', error.message);
    return null;
  }
}

/**
 * Aggregate non-sensitive system metrics across tables.
 */
export function getSystemMetrics(db) {
  if (!db) return {};

  const totalUsers = db.prepare("SELECT COUNT(*) AS count FROM users").get()?.count || 0;
  const activeUsers = db.prepare("SELECT COUNT(*) AS count FROM users WHERE status = 'active'").get()?.count || 0;
  const deactivatedUsers = db.prepare("SELECT COUNT(*) AS count FROM users WHERE status = 'deactivated'").get()?.count || 0;

  const rolesRows = db.prepare("SELECT role, COUNT(*) AS count FROM users GROUP BY role").all() || [];
  const usersByRole = {};
  for (const row of rolesRows) {
    usersByRole[row.role] = row.count;
  }

  const statusesRows = db.prepare("SELECT status, COUNT(*) AS count FROM users GROUP BY status").all() || [];
  const usersByStatus = {};
  for (const row of statusesRows) {
    usersByStatus[row.status] = row.count;
  }

  const totalDevices = db.prepare("SELECT COUNT(*) AS count FROM device_tokens").get()?.count || 0;
  const activeDevices = db.prepare("SELECT COUNT(*) AS count FROM device_tokens WHERE revoked_at IS NULL").get()?.count || 0;

  const totalSentencesAnalyzed = db.prepare("SELECT COUNT(*) AS count FROM writing_samples WHERE status = 'completed'").get()?.count || 0;
  const totalWritingSamples = db.prepare("SELECT COUNT(*) AS count FROM writing_samples").get()?.count || 0;

  const totalPracticeSessions = db.prepare("SELECT COUNT(*) AS count FROM practice_sessions").get()?.count || 0;
  const completedPracticeSessions = db.prepare("SELECT COUNT(*) AS count FROM practice_sessions WHERE status = 'completed'").get()?.count || 0;
  const practiceCompletionRate = totalPracticeSessions > 0
    ? Number(((completedPracticeSessions / totalPracticeSessions) * 100).toFixed(1))
    : 0;

  const totalFeedback = db.prepare("SELECT COUNT(*) AS count FROM correction_feedback").get()?.count || 0;
  const feedbackTypeRows = db.prepare("SELECT feedback_type, COUNT(*) AS count FROM correction_feedback GROUP BY feedback_type").all() || [];
  const feedbackByType = {};
  for (const row of feedbackTypeRows) {
    feedbackByType[row.feedback_type] = row.count;
  }

  const totalTelemetryEvents = db.prepare("SELECT COUNT(*) AS count FROM analytics_events").get()?.count || 0;
  const telemetryEventRows = db.prepare("SELECT event_name, COUNT(*) AS count FROM analytics_events GROUP BY event_name").all() || [];
  const telemetryEventsByEvent = {};
  for (const row of telemetryEventRows) {
    telemetryEventsByEvent[row.event_name] = row.count;
  }

  return {
    totalUsers,
    total_users: totalUsers,
    activeUsers,
    active_users: activeUsers,
    deactivatedUsers,
    deactivated_users: deactivatedUsers,
    usersByRole,
    usersByStatus,

    totalDevices,
    total_devices: totalDevices,
    activeDevices,
    active_devices: activeDevices,

    totalSentencesAnalyzed,
    total_sentences_analyzed: totalSentencesAnalyzed,
    totalWritingSamples,
    total_writing_samples: totalWritingSamples,

    dailyPracticeCompletionRate: practiceCompletionRate,
    daily_practice_completion_rate: practiceCompletionRate,
    dailyPractice: {
      totalSessions: totalPracticeSessions,
      completedSessions: completedPracticeSessions,
      completionRate: practiceCompletionRate
    },
    daily_practice: {
      total_sessions: totalPracticeSessions,
      completed_sessions: completedPracticeSessions,
      completion_rate: practiceCompletionRate
    },

    feedbackCounts: {
      total: totalFeedback,
      byType: feedbackByType
    },
    feedback_counts: {
      total: totalFeedback,
      by_type: feedbackByType
    },
    feedback: {
      totalCount: totalFeedback,
      byType: feedbackByType
    },

    telemetryEventsCount: totalTelemetryEvents,
    telemetry_events_count: totalTelemetryEvents,
    telemetryEventsByEvent
  };
}
