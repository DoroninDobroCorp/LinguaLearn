export const EXTERNAL_SCORE_WEIGHTS = Object.freeze({
  success: 1,
  error: -2,
});

export function calculateTopicStatus({
  score = 0,
  success_count = 0,
  error_count = 0,
  unique_practice_days = 0,
  last_error_at = null,
  last_success_at = null,
}) {
  const totalEvidence = (success_count || 0) + (error_count || 0);

  if (totalEvidence === 0) {
    return 'not_started';
  }

  const hasNoError = (error_count || 0) === 0;
  const hasNoRecentErrors =
    hasNoError ||
    (last_success_at && last_error_at && new Date(last_success_at) > new Date(last_error_at));

  const hasRecentError =
    (error_count || 0) > 0 &&
    last_error_at &&
    (!last_success_at || new Date(last_error_at) >= new Date(last_success_at));
  const hasDominantErrors = (error_count || 0) >= 2 && (error_count || 0) > (success_count || 0);

  if (hasRecentError || hasDominantErrors) {
    return 'recurring_problem';
  }

  // Mastered: requires 5+ unique practice days, zero recent errors, high score (score >= 80)
  if (unique_practice_days >= 5 && score >= 80 && hasNoRecentErrors) {
    return 'mastered';
  }

  // Stable: score >= 70, totalEvidence >= 3, zero recent errors
  if (score >= 70 && totalEvidence >= 3 && hasNoRecentErrors) {
    return 'stable';
  }

  // Insufficient evidence: totalEvidence < 3 and unique_practice_days < 2
  if (totalEvidence < 3 && unique_practice_days < 2) {
    return 'insufficient_evidence';
  }

  return 'improving';
}

export function calculateMasteryConfidence({
  score = 0,
  success_count = 0,
  error_count = 0,
  unique_practice_days = 0,
  last_error_at = null,
  last_success_at = null,
}) {
  const totalEvidence = (success_count || 0) + (error_count || 0);
  if (totalEvidence === 0) return 0;

  const scoreFactor = Math.max(0, Math.min(100, score)) / 100;
  const daysFactor = Math.min(unique_practice_days || 0, 5) / 5;
  const volumeFactor = Math.min(totalEvidence, 5) / 5;
  const hasNoError = (error_count || 0) === 0;
  const hasNoRecentErrors =
    hasNoError ||
    (last_success_at && last_error_at && new Date(last_success_at) > new Date(last_error_at));
  const errorPenalty = hasNoRecentErrors ? 1.0 : 0.5;

  const rawConfidence = (scoreFactor * 0.5 + daysFactor * 0.3 + volumeFactor * 0.2) * errorPenalty;
  return Math.round(Math.max(0, Math.min(1, rawConfidence)) * 1000) / 1000;
}

export function getUserTopicProgress(db, userId, curriculumTopicId) {
  const row = db
    .prepare(
      `
    SELECT * FROM user_topic_progress
    WHERE user_id = ? AND curriculum_topic_id = ?
  `
    )
    .get(userId, curriculumTopicId);

  if (!row) {
    return {
      user_id: userId,
      curriculum_topic_id: curriculumTopicId,
      status: 'not_started',
      score: 0,
      success_count: 0,
      error_count: 0,
      last_practiced: null,
      last_error_at: null,
      last_success_at: null,
      unique_practice_days: 0,
      mastery_confidence: 0,
    };
  }

  const mastery_confidence = calculateMasteryConfidence(row);
  return {
    ...row,
    mastery_confidence,
  };
}

export function recordTopicEvidence(
  db,
  { userId, curriculumTopicId, outcome, confidence = 1.0, timestamp = null }
) {
  const isHighConfidence = confidence >= 0.7;
  const current = getUserTopicProgress(db, userId, curriculumTopicId);

  if (!isHighConfidence && current.status === 'not_started') {
    return {
      score: 0,
      status: 'not_started',
      uniquePracticeDays: 0,
      masteryConfidence: 0,
    };
  }

  const rawDelta = outcome === 'success' ? EXTERNAL_SCORE_WEIGHTS.success : EXTERNAL_SCORE_WEIGHTS.error;
  const scoreDelta = isHighConfidence ? rawDelta : 0;

  const newScore = Math.max(0, Math.min(100, (current.score || 0) + scoreDelta));
  const newSuccessCount = outcome === 'success' ? (current.success_count || 0) + 1 : (current.success_count || 0);
  const newErrorCount = outcome === 'error' ? (current.error_count || 0) + 1 : (current.error_count || 0);

  const nowStr = timestamp || new Date().toISOString().replace('T', ' ').slice(0, 19);
  const eventDateStr = nowStr.slice(0, 10);

  const lastPracticedDateStr = current.last_practiced ? current.last_practiced.slice(0, 10) : null;
  const isNewDay = !lastPracticedDateStr || lastPracticedDateStr !== eventDateStr;

  const newUniqueDays = isNewDay
    ? (current.unique_practice_days || 0) + 1
    : Math.max(1, current.unique_practice_days || 1);

  const newLastErrorAt = outcome === 'error' ? nowStr : current.last_error_at;
  const newLastSuccessAt = outcome === 'success' ? nowStr : current.last_success_at;

  const newStatus = calculateTopicStatus({
    score: newScore,
    success_count: newSuccessCount,
    error_count: newErrorCount,
    unique_practice_days: newUniqueDays,
    last_error_at: newLastErrorAt,
    last_success_at: newLastSuccessAt,
  });

  db.prepare(
    `
    INSERT INTO user_topic_progress (
      user_id, curriculum_topic_id, status, score, success_count, error_count,
      last_practiced, last_error_at, last_success_at, unique_practice_days, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, curriculum_topic_id) DO UPDATE SET
      status = excluded.status,
      score = excluded.score,
      success_count = excluded.success_count,
      error_count = excluded.error_count,
      last_practiced = excluded.last_practiced,
      last_error_at = COALESCE(excluded.last_error_at, user_topic_progress.last_error_at),
      last_success_at = COALESCE(excluded.last_success_at, user_topic_progress.last_success_at),
      unique_practice_days = excluded.unique_practice_days,
      updated_at = CURRENT_TIMESTAMP
  `
  ).run(
    userId,
    curriculumTopicId,
    newStatus,
    newScore,
    newSuccessCount,
    newErrorCount,
    nowStr,
    newLastErrorAt,
    newLastSuccessAt,
    newUniqueDays
  );

  // Sync to legacy curriculum_topics table if score/status columns exist
  const topicHasScore = db
    .prepare("PRAGMA table_info(curriculum_topics)")
    .all()
    .some((c) => c.name === 'score');
  if (topicHasScore) {
    db.prepare(
      `
      UPDATE curriculum_topics
      SET score = ?, status = ?,
          success_count = success_count + ?,
          failure_count = failure_count + ?,
          last_practiced = ?
      WHERE id = ?
    `
    ).run(
      newScore,
      newStatus,
      outcome === 'success' ? 1 : 0,
      outcome === 'error' ? 1 : 0,
      nowStr,
      curriculumTopicId
    );
  }

  return {
    score: newScore,
    status: newStatus,
    uniquePracticeDays: newUniqueDays,
    masteryConfidence: calculateMasteryConfidence({
      score: newScore,
      success_count: newSuccessCount,
      error_count: newErrorCount,
      unique_practice_days: newUniqueDays,
      last_error_at: newLastErrorAt,
      last_success_at: newLastSuccessAt,
    }),
  };
}

export function recalculateTopicProgress(db, userId, curriculumTopicId) {
  const current = getUserTopicProgress(db, userId, curriculumTopicId);
  if (!current || current.status === 'not_started') return current;

  const newStatus = calculateTopicStatus(current);
  if (newStatus !== current.status) {
    db.prepare(
      `
      UPDATE user_topic_progress
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND curriculum_topic_id = ?
    `
    ).run(newStatus, userId, curriculumTopicId);

    const topicHasScore = db
      .prepare("PRAGMA table_info(curriculum_topics)")
      .all()
      .some((c) => c.name === 'score');
    if (topicHasScore) {
      db.prepare(
        `
        UPDATE curriculum_topics
        SET status = ?
        WHERE id = ?
      `
      ).run(newStatus, curriculumTopicId);
    }
  }

  return getUserTopicProgress(db, userId, curriculumTopicId);
}
