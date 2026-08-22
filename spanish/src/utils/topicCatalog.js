const ACTIVE_STATUSES = new Set(['learning', 'review', 'relearning', 'in_progress']);

export function clampTopicScore(score) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

export function isTopicMastered(topic) {
  if (topic.level === 'A1') return topic.status === 'mastered';
  return Boolean(
    topic.is_locked
    || topic.status === 'mastered'
    || clampTopicScore(topic.score) >= 80
  );
}

export function getTopicStage(topic) {
  if (isTopicMastered(topic)) return 'mastered';
  if (ACTIVE_STATUSES.has(topic.status) || clampTopicScore(topic.score) > 0) {
    return 'in_progress';
  }
  return 'not_started';
}

export function getTopicStatusLabel(topic) {
  if (isTopicMastered(topic)) return 'Освоено';
  if (topic.status === 'review') return 'На повторении';
  if (topic.status === 'relearning') return 'Нужно повторить';
  if (topic.status === 'learning' || topic.status === 'in_progress') return 'Изучается';
  return 'Не начато';
}

export function topicMatchesFilters(topic, {
  category = 'all',
  status = 'all',
  search = '',
} = {}) {
  if (category !== 'all' && topic.category !== category) return false;
  if (status !== 'all' && getTopicStage(topic) !== status) return false;

  const query = search.trim().toLocaleLowerCase('ru');
  if (!query) return true;

  return [topic.name, topic.category, topic.level]
    .filter(Boolean)
    .some(value => String(value).toLocaleLowerCase('ru').includes(query));
}
