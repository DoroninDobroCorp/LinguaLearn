import {
  buildVocabularyExactDuplicateKey,
  buildVocabularyTextKey,
} from './unicodeKeys.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_EASE_FACTOR = 2.3;
const LEARNED_SUPPRESSION_DAYS = 15;
const IMPORT_TIMESTAMP_FUTURE_SKEW_MS = 48 * 60 * 60 * 1000;

export const REVIEW_CARD_DIRECTIONS = ['source_to_target', 'target_to_source'];
export const REVIEW_GRADES = ['dont_know', 'hard', 'good', 'easy'];
export const VOCABULARY_EXPORT_FORMAT_VERSION = 1;

const REVIEW_CARD_STATES = ['new', 'learning', 'review'];

const DIRECTION_META = {
  source_to_target: {
    label: 'Spanish → Translation',
    promptLabel: 'Spanish',
    answerLabel: 'Translation',
    promptField: 'word',
    answerField: 'translation',
  },
  target_to_source: {
    label: 'Translation → Spanish',
    promptLabel: 'Translation',
    answerLabel: 'Spanish',
    promptField: 'translation',
    answerField: 'word',
  },
};

export class VocabularyApiError extends Error {
  constructor(status, message, code = 'VOCABULARY_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toIso(value, fallback = new Date()) {
  if (value === null || value === undefined || value === '') {
    return new Date(fallback).toISOString();
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date(fallback).toISOString();
  }
  return date.toISOString();
}

function toValidDate(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function sanitizeImportedTimestamp(value, now = new Date(), {
  fallback = null,
  maxFutureMs = IMPORT_TIMESTAMP_FUTURE_SKEW_MS,
} = {}) {
  const fallbackDate = toValidDate(fallback);
  const parsed = toValidDate(value) ?? fallbackDate;
  if (!parsed) {
    return null;
  }

  const futureUpperBound = now.getTime() + maxFutureMs;
  if (parsed.getTime() > futureUpperBound) {
    return new Date(futureUpperBound).toISOString();
  }

  return parsed.toISOString();
}

function addDays(baseDate, days) {
  return new Date(baseDate.getTime() + (days * MS_PER_DAY));
}

function deriveImportedNextReviewAt(intervalDays, lastReviewedAt, now = new Date()) {
  const baseDate = lastReviewedAt ? new Date(lastReviewedAt) : now;
  return toIso(addDays(baseDate, intervalDays), now);
}

function hasNonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function toTrimmedNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new VocabularyApiError(400, 'Expected a string value', 'INVALID_STRING');
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function validateVocabularyInput(payload = {}) {
  const word = toTrimmedNullableString(payload.word);
  const translation = toTrimmedNullableString(payload.translation);
  const example = toTrimmedNullableString(payload.example);

  if (!word) {
    throw new VocabularyApiError(400, 'word is required and must be a non-empty string', 'INVALID_WORD');
  }
  if (!translation) {
    throw new VocabularyApiError(400, 'translation is required and must be a non-empty string', 'INVALID_TRANSLATION');
  }

  return { word, translation, example };
}

function deriveLegacyCardState(row, nextReviewAt, now) {
  const reviewCount = Math.max(0, Number(row.review_count) || 0);
  const level = Math.max(0, Number(row.level) || 0);
  if (reviewCount === 0) {
    return 'new';
  }
  const nextReview = new Date(nextReviewAt);
  if (!Number.isNaN(nextReview.getTime()) && nextReview.getTime() > now.getTime() && (reviewCount >= 2 || level >= 2)) {
    return 'review';
  }
  return 'learning';
}

function getCardStatus(card, now = new Date()) {
  const learnedUntil = card.learned_until ? new Date(card.learned_until) : null;
  if (learnedUntil && !Number.isNaN(learnedUntil.getTime()) && learnedUntil.getTime() > now.getTime()) {
    return 'learned';
  }

  if (card.state === 'new') {
    return 'new';
  }

  const nextReviewAt = new Date(card.next_review_at);
  if (!Number.isNaN(nextReviewAt.getTime()) && nextReviewAt.getTime() > now.getTime()) {
    return 'snoozed';
  }

  if (card.state === 'learning') {
    return 'learning';
  }

  return 'review';
}

function isCardDue(card, now = new Date()) {
  const learnedUntil = card.learned_until ? new Date(card.learned_until) : null;
  if (learnedUntil && !Number.isNaN(learnedUntil.getTime()) && learnedUntil.getTime() > now.getTime()) {
    return false;
  }

  const nextReviewAt = new Date(card.next_review_at);
  if (Number.isNaN(nextReviewAt.getTime())) {
    return false;
  }

  return nextReviewAt.getTime() <= now.getTime();
}

function isCardReviewable(card) {
  const meta = DIRECTION_META[card.direction];
  if (!meta) {
    return false;
  }

  return hasNonEmptyText(card[meta.promptField]) && hasNonEmptyText(card[meta.answerField]);
}

function assertCardReviewable(card) {
  if (!isCardReviewable(card)) {
    throw new VocabularyApiError(
      409,
      'Review card is missing required prompt or answer text. Complete the vocabulary entry before reviewing it.',
      'CARD_NOT_REVIEWABLE',
    );
  }
}

function assertCardDue(card, now = new Date()) {
  if (!isCardDue(card, now)) {
    throw new VocabularyApiError(
      409,
      'Review card is not currently due for review.',
      'CARD_NOT_DUE',
    );
  }
}

function buildCardPresentation(row, now = new Date()) {
  const meta = DIRECTION_META[row.direction];
  const prompt = row[meta.promptField] || '';
  const answer = row[meta.answerField] || '';
  const status = getCardStatus(row, now);
  const reviewable = isCardReviewable(row);
  const due = reviewable && isCardDue(row, now);

  return {
    id: row.id,
    vocabulary_id: row.vocabulary_id,
    profile_id: row.profile_id,
    direction: row.direction,
    direction_label: meta.label,
    prompt_label: meta.promptLabel,
    answer_label: meta.answerLabel,
    prompt,
    answer,
    is_reviewable: reviewable,
    word: row.word,
    translation: row.translation,
    example: row.example,
    state: row.state,
    status,
    is_due: due,
    review_count: row.review_count,
    lapse_count: row.lapse_count,
    interval_days: row.interval_days,
    ease_factor: row.ease_factor,
    next_review_at: toIso(row.next_review_at),
    learned_until: row.learned_until ? toIso(row.learned_until) : null,
    last_reviewed_at: row.last_reviewed_at ? toIso(row.last_reviewed_at) : null,
    created_at: row.created_at ? toIso(row.created_at) : null,
    updated_at: row.updated_at ? toIso(row.updated_at) : null,
  };
}

function getDueSortPriority(card) {
  switch (card.state) {
    case 'learning':
      return 0;
    case 'new':
      return 1;
    default:
      return 2;
  }
}

function compareDueCards(left, right) {
  const leftPriority = getDueSortPriority(left);
  const rightPriority = getDueSortPriority(right);
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  const leftTime = left.next_review_at ? new Date(left.next_review_at).getTime() : Number.POSITIVE_INFINITY;
  const rightTime = right.next_review_at ? new Date(right.next_review_at).getTime() : Number.POSITIVE_INFINITY;
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  const leftReviewCount = Number(left.review_count) || 0;
  const rightReviewCount = Number(right.review_count) || 0;
  if (leftReviewCount !== rightReviewCount) {
    return leftReviewCount - rightReviewCount;
  }

  return (Number(left.id) || 0) - (Number(right.id) || 0);
}

function summarizeEntryCards(cards) {
  const summary = {
    total_cards: cards.length,
    reviewable_cards: 0,
    unreviewable_cards: 0,
    due_cards: 0,
    learned_cards: 0,
    learning_cards: 0,
    new_cards: 0,
    review_cards: 0,
    snoozed_cards: 0,
    total_reviews: 0,
    next_due_at: null,
  };

  for (const card of cards) {
    summary.total_reviews += Number(card.review_count) || 0;
    if (card.is_reviewable) {
      summary.reviewable_cards += 1;
    } else {
      summary.unreviewable_cards += 1;
      continue;
    }
    if (card.is_due) {
      summary.due_cards += 1;
    }
    if (card.status === 'learned') {
      summary.learned_cards += 1;
    }
    if (card.status === 'learning') {
      summary.learning_cards += 1;
    }
    if (card.status === 'new') {
      summary.new_cards += 1;
    }
    if (card.status === 'review') {
      summary.review_cards += 1;
    }
    if (card.status === 'snoozed') {
      summary.snoozed_cards += 1;
    }

    if (!summary.next_due_at || new Date(card.next_review_at).getTime() < new Date(summary.next_due_at).getTime()) {
      summary.next_due_at = card.next_review_at;
    }
  }

  return summary;
}

function createDirectionStats() {
  return {
    total_cards: 0,
    reviewable_cards: 0,
    unreviewable_cards: 0,
    due_cards: 0,
    learned_cards: 0,
    learning_cards: 0,
    new_cards: 0,
    review_cards: 0,
    snoozed_cards: 0,
  };
}

function addCardToDirectionStats(directionStats, card) {
  directionStats.total_cards += 1;
  if (card.is_reviewable) {
    directionStats.reviewable_cards += 1;
  } else {
    directionStats.unreviewable_cards += 1;
    return;
  }

  if (card.is_due) {
    directionStats.due_cards += 1;
  }
  if (card.status === 'learned') {
    directionStats.learned_cards += 1;
  }
  if (card.status === 'learning') {
    directionStats.learning_cards += 1;
  }
  if (card.status === 'new') {
    directionStats.new_cards += 1;
  }
  if (card.status === 'review') {
    directionStats.review_cards += 1;
  }
  if (card.status === 'snoozed') {
    directionStats.snoozed_cards += 1;
  }
}

function scheduleGrade(card, grade, now = new Date()) {
  const easeFactor = clamp(Number(card.ease_factor) || DEFAULT_EASE_FACTOR, 1.3, 3.8);
  const previousInterval = Math.max(0, Number(card.interval_days) || 0);

  let nextEaseFactor = easeFactor;
  let nextIntervalDays = 0;
  let nextState = 'learning';
  let lapseIncrement = 0;

  switch (grade) {
    case 'dont_know':
      nextEaseFactor = clamp(easeFactor - 0.2, 1.3, 3.4);
      nextIntervalDays = 0;
      nextState = 'learning';
      lapseIncrement = 1;
      break;
    case 'hard':
      nextEaseFactor = clamp(easeFactor - 0.05, 1.3, 3.6);
      nextIntervalDays = previousInterval < 0.5 ? 0.25 : Math.max(0.5, Number((previousInterval * 1.2).toFixed(2)));
      nextState = 'learning';
      break;
    case 'good':
      nextIntervalDays = previousInterval < 0.5
        ? (Number(card.review_count) > 0 ? 2 : 1)
        : Math.max(1, Number((previousInterval * easeFactor).toFixed(2)));
      nextState = Number(card.review_count) >= 1 ? 'review' : 'learning';
      break;
    case 'easy':
      nextEaseFactor = clamp(easeFactor + 0.1, 1.3, 3.8);
      nextIntervalDays = previousInterval < 1
        ? 3
        : Math.max(3, Number((previousInterval * (easeFactor + 0.35)).toFixed(2)));
      nextState = 'review';
      break;
    default:
      throw new VocabularyApiError(400, 'grade must be one of dont_know, hard, good, easy', 'INVALID_GRADE');
  }

  const nextReviewAt = toIso(addDays(now, nextIntervalDays), now);

  return {
    state: nextState,
    interval_days: nextIntervalDays,
    ease_factor: nextEaseFactor,
    next_review_at: nextReviewAt,
    learned_until: null,
    last_reviewed_at: toIso(now),
    review_count: (Number(card.review_count) || 0) + 1,
    lapse_count: (Number(card.lapse_count) || 0) + lapseIncrement,
  };
}

function scheduleLearned(card, now = new Date()) {
  const learnedUntil = toIso(addDays(now, LEARNED_SUPPRESSION_DAYS), now);
  return {
    state: Number(card.review_count) >= 1 ? 'review' : 'learning',
    interval_days: LEARNED_SUPPRESSION_DAYS,
    ease_factor: clamp(Number(card.ease_factor) || DEFAULT_EASE_FACTOR, 1.3, 3.8),
    next_review_at: learnedUntil,
    learned_until: learnedUntil,
    last_reviewed_at: toIso(now),
    review_count: (Number(card.review_count) || 0) + 1,
    lapse_count: Number(card.lapse_count) || 0,
  };
}

function fetchEntryRows(db, profileId) {
  return db.prepare(`
    SELECT
      v.id AS entry_id,
      v.profile_id AS entry_profile_id,
      v.word,
      v.translation,
      v.example,
      v.created_at AS entry_created_at,
      c.id,
      c.vocabulary_id,
      c.profile_id,
      c.direction,
      c.state,
      c.review_count,
      c.lapse_count,
      c.interval_days,
      c.ease_factor,
      c.next_review_at,
      c.learned_until,
      c.last_reviewed_at,
      c.created_at,
      c.updated_at
    FROM vocabulary v
    LEFT JOIN vocabulary_review_cards c ON c.vocabulary_id = v.id
    WHERE v.profile_id = ?
    ORDER BY LOWER(v.word) ASC, c.direction ASC
  `).all(profileId);
}

function fetchReviewCardRow(db, profileId, cardId) {
  const card = db.prepare(`
    SELECT
      c.*,
      v.word,
      v.translation,
      v.example
    FROM vocabulary_review_cards c
    JOIN vocabulary v ON v.id = c.vocabulary_id
    WHERE c.id = ? AND c.profile_id = ?
  `).get(cardId, profileId);

  if (!card) {
    throw new VocabularyApiError(404, 'Review card not found', 'CARD_NOT_FOUND');
  }

  return card;
}

function fetchEntryById(db, profileId, entryId, now = new Date()) {
  const rows = db.prepare(`
    SELECT
      v.id AS entry_id,
      v.profile_id AS entry_profile_id,
      v.word,
      v.translation,
      v.example,
      v.created_at AS entry_created_at,
      c.id,
      c.vocabulary_id,
      c.profile_id,
      c.direction,
      c.state,
      c.review_count,
      c.lapse_count,
      c.interval_days,
      c.ease_factor,
      c.next_review_at,
      c.learned_until,
      c.last_reviewed_at,
      c.created_at,
      c.updated_at
    FROM vocabulary v
    LEFT JOIN vocabulary_review_cards c ON c.vocabulary_id = v.id
    WHERE v.id = ? AND v.profile_id = ?
    ORDER BY c.direction ASC
  `).all(entryId, profileId);

  if (rows.length === 0) {
    throw new VocabularyApiError(404, 'Vocabulary entry not found', 'VOCAB_NOT_FOUND');
  }

  const entry = buildVocabularyEntries(rows, now)[0];
  if (!entry) {
    throw new VocabularyApiError(404, 'Vocabulary entry not found', 'VOCAB_NOT_FOUND');
  }
  return entry;
}

function buildVocabularyEntries(rows, now = new Date()) {
  const grouped = new Map();

  for (const row of rows) {
    const key = row.entry_id;
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: row.entry_id,
        profile_id: row.entry_profile_id,
        word: row.word,
        translation: row.translation,
        example: row.example,
        created_at: toIso(row.entry_created_at),
        cards: [],
      });
    }

    if (row.id) {
      grouped.get(key).cards.push(buildCardPresentation(row, now));
    }
  }

  return Array.from(grouped.values()).map((entry) => ({
    ...entry,
    card_summary: summarizeEntryCards(entry.cards),
    needs_completion: entry.cards.some((card) => !card.is_reviewable),
  }));
}

function insertVocabularyEntryRow(db, profileId, { word, translation, example, created_at }, now = new Date()) {
  const createdAt = created_at ? toIso(created_at, now) : toIso(now);
  const wordKey = buildVocabularyTextKey(word);
  const translationKey = buildVocabularyTextKey(translation);
  const result = db.prepare(`
    INSERT INTO vocabulary (
      word,
      word_key,
      translation,
      translation_key,
      example,
      level,
      next_review,
      review_count,
      last_reviewed,
      created_at,
      profile_id
    )
    VALUES (?, ?, ?, ?, ?, 0, ?, 0, NULL, ?, ?)
  `).run(word, wordKey, translation, translationKey, example, createdAt, createdAt, profileId);

  db.prepare(`
    INSERT INTO vocabulary_review_cards (
      vocabulary_id,
      profile_id,
      direction,
      state,
      review_count,
      lapse_count,
      interval_days,
      ease_factor,
      next_review_at,
      learned_until,
      last_reviewed_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, 'new', 0, 0, 0, ?, ?, NULL, NULL, ?, ?)
  `).run(result.lastInsertRowid, profileId, 'source_to_target', DEFAULT_EASE_FACTOR, createdAt, createdAt, createdAt);

  db.prepare(`
    INSERT INTO vocabulary_review_cards (
      vocabulary_id,
      profile_id,
      direction,
      state,
      review_count,
      lapse_count,
      interval_days,
      ease_factor,
      next_review_at,
      learned_until,
      last_reviewed_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, 'new', 0, 0, 0, ?, ?, NULL, NULL, ?, ?)
  `).run(result.lastInsertRowid, profileId, 'target_to_source', DEFAULT_EASE_FACTOR, createdAt, createdAt, createdAt);

  return result.lastInsertRowid;
}

export function ensureVocabularyReviewSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vocabulary_review_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vocabulary_id INTEGER NOT NULL REFERENCES vocabulary(id) ON DELETE CASCADE,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK (direction IN ('source_to_target', 'target_to_source')),
      state TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new', 'learning', 'review')),
      review_count INTEGER NOT NULL DEFAULT 0,
      lapse_count INTEGER NOT NULL DEFAULT 0,
      interval_days REAL NOT NULL DEFAULT 0,
      ease_factor REAL NOT NULL DEFAULT 2.3,
      next_review_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      learned_until TEXT,
      last_reviewed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(vocabulary_id, direction)
    );

    CREATE INDEX IF NOT EXISTS idx_review_cards_profile_due
      ON vocabulary_review_cards(profile_id, next_review_at);
    CREATE INDEX IF NOT EXISTS idx_review_cards_vocabulary
      ON vocabulary_review_cards(vocabulary_id);
  `);

  const insertCard = db.prepare(`
    INSERT OR IGNORE INTO vocabulary_review_cards (
      vocabulary_id,
      profile_id,
      direction,
      state,
      review_count,
      lapse_count,
      interval_days,
      ease_factor,
      next_review_at,
      learned_until,
      last_reviewed_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const migrate = db.transaction(() => {
    const rows = db.prepare('SELECT * FROM vocabulary ORDER BY id ASC').all();
    const now = new Date();

    for (const row of rows) {
      const sourceNextReviewAt = toIso(row.next_review, now);
      const sourceNextReviewDate = new Date(sourceNextReviewAt);
      const sourceIntervalDays = Math.max(
        0,
        Number(((sourceNextReviewDate.getTime() - now.getTime()) / MS_PER_DAY).toFixed(2)) || 0,
      );
      const sourceState = deriveLegacyCardState(row, sourceNextReviewAt, now);
      const sourceEase = clamp(2 + ((Number(row.level) || 0) * 0.15), 1.3, 3.6);
      const updatedAt = toIso(row.last_reviewed || row.created_at || now, now);

      insertCard.run(
        row.id,
        row.profile_id,
        'source_to_target',
        sourceState,
        Math.max(0, Number(row.review_count) || 0),
        0,
        sourceIntervalDays,
        sourceEase,
        sourceNextReviewAt,
        null,
        row.last_reviewed ? toIso(row.last_reviewed, now) : null,
        updatedAt,
      );

      insertCard.run(
        row.id,
        row.profile_id,
        'target_to_source',
        'new',
        0,
        0,
        0,
        DEFAULT_EASE_FACTOR,
        toIso(now),
        null,
        null,
        updatedAt,
      );
    }
  });

  migrate();
}

export function createVocabularyEntry(db, profileId, payload, now = new Date()) {
  const { word, translation, example } = validateVocabularyInput(payload);
  const wordKey = buildVocabularyTextKey(word);
  const translationKey = buildVocabularyTextKey(translation);

  const existing = db.prepare(
    `SELECT id
     FROM vocabulary
     WHERE word_key = ?
       AND translation_key = ?
       AND profile_id = ?`
  ).get(wordKey, translationKey, profileId);

  if (existing) {
    throw new VocabularyApiError(400, 'Word and translation already exist', 'DUPLICATE_WORD');
  }

  const createEntry = db.transaction(() => {
    return insertVocabularyEntryRow(db, profileId, { word, translation, example }, now);
  });

  const entryId = createEntry();
  return fetchEntryById(db, profileId, entryId, now);
}

export function listVocabularyEntries(db, profileId, now = new Date()) {
  const entries = buildVocabularyEntries(fetchEntryRows(db, profileId), now);

  const stats = {
    total_entries: entries.length,
    total_cards: 0,
    reviewable_cards: 0,
    unreviewable_cards: 0,
    due_cards: 0,
    learned_cards: 0,
    learning_cards: 0,
    new_cards: 0,
    snoozed_cards: 0,
    mastered_entries: 0,
    pending_completion_entries: 0,
    directions: {
      source_to_target: {
        label: DIRECTION_META.source_to_target.label,
        ...createDirectionStats(),
      },
      target_to_source: {
        label: DIRECTION_META.target_to_source.label,
        ...createDirectionStats(),
      },
    },
  };

  for (const entry of entries) {
    stats.total_cards += entry.card_summary.total_cards;
    stats.reviewable_cards += entry.card_summary.reviewable_cards;
    stats.unreviewable_cards += entry.card_summary.unreviewable_cards;
    stats.due_cards += entry.card_summary.due_cards;
    stats.learned_cards += entry.card_summary.learned_cards;
    stats.learning_cards += entry.card_summary.learning_cards;
    stats.new_cards += entry.card_summary.new_cards;
    stats.snoozed_cards += entry.card_summary.snoozed_cards;
    for (const card of entry.cards) {
      addCardToDirectionStats(stats.directions[card.direction], card);
    }

    const reviewableCards = entry.cards.filter((card) => card.is_reviewable);
    if (entry.needs_completion) {
      stats.pending_completion_entries += 1;
    }

    if (
      reviewableCards.length > 0
      && reviewableCards.every((card) => !card.is_due && (card.status === 'learned' || card.status === 'snoozed'))
    ) {
      stats.mastered_entries += 1;
    }
  }

  return { entries, stats };
}

export function listDueReviewCards(db, profileId, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const requestedLimit = Number.parseInt(options.limit ?? '40', 10);
  const limit = Number.isFinite(requestedLimit) ? clamp(requestedLimit, 1, 200) : 40;
  const nowIso = toIso(now);

  const dueRows = db.prepare(`
    SELECT
      c.*,
      v.word,
      v.translation,
      v.example
    FROM vocabulary_review_cards c
    JOIN vocabulary v ON v.id = c.vocabulary_id
    WHERE c.profile_id = ?
      AND TRIM(COALESCE(v.word, '')) != ''
      AND TRIM(COALESCE(v.translation, '')) != ''
      AND c.next_review_at <= ?
      AND (c.learned_until IS NULL OR c.learned_until <= ?)
    ORDER BY
      CASE c.state WHEN 'learning' THEN 0 WHEN 'new' THEN 1 ELSE 2 END,
      c.next_review_at ASC,
      c.review_count ASC,
      c.id ASC
    LIMIT ?
  `).all(profileId, nowIso, nowIso, limit);

  const totalDue = db.prepare(`
    SELECT COUNT(*) AS count
    FROM vocabulary_review_cards c
    JOIN vocabulary v ON v.id = c.vocabulary_id
    WHERE c.profile_id = ?
      AND TRIM(COALESCE(v.word, '')) != ''
      AND TRIM(COALESCE(v.translation, '')) != ''
      AND c.next_review_at <= ?
      AND (c.learned_until IS NULL OR c.learned_until <= ?)
  `).get(profileId, nowIso, nowIso).count;

  return {
    cards: dueRows.map((row) => buildCardPresentation(row, now)),
    stats: {
      total_due: totalDue,
      returned: dueRows.length,
      limit,
    },
  };
}

export function reviewVocabularyCard(db, profileId, cardId, grade, now = new Date()) {
  const normalizedGrade = typeof grade === 'string' ? grade.trim() : '';
  if (!REVIEW_GRADES.includes(normalizedGrade)) {
    throw new VocabularyApiError(400, 'grade must be one of dont_know, hard, good, easy', 'INVALID_GRADE');
  }

  const review = db.transaction(() => {
    const card = fetchReviewCardRow(db, profileId, cardId);
    assertCardReviewable(card);
    assertCardDue(card, now);
    const next = scheduleGrade(card, normalizedGrade, now);

    db.prepare(`
      UPDATE vocabulary_review_cards
      SET state = ?,
          review_count = ?,
          lapse_count = ?,
          interval_days = ?,
          ease_factor = ?,
          next_review_at = ?,
          learned_until = ?,
          last_reviewed_at = ?,
          updated_at = ?
      WHERE id = ? AND profile_id = ?
    `).run(
      next.state,
      next.review_count,
      next.lapse_count,
      next.interval_days,
      next.ease_factor,
      next.next_review_at,
      next.learned_until,
      next.last_reviewed_at,
      next.last_reviewed_at,
      cardId,
      profileId,
    );

    return fetchReviewCardRow(db, profileId, cardId);
  });

  return buildCardPresentation(review(), now);
}

export function markVocabularyCardLearned(db, profileId, cardId, now = new Date()) {
  const mark = db.transaction(() => {
    const card = fetchReviewCardRow(db, profileId, cardId);
    assertCardReviewable(card);
    assertCardDue(card, now);
    const next = scheduleLearned(card, now);

    db.prepare(`
      UPDATE vocabulary_review_cards
      SET state = ?,
          review_count = ?,
          lapse_count = ?,
          interval_days = ?,
          ease_factor = ?,
          next_review_at = ?,
          learned_until = ?,
          last_reviewed_at = ?,
          updated_at = ?
      WHERE id = ? AND profile_id = ?
    `).run(
      next.state,
      next.review_count,
      next.lapse_count,
      next.interval_days,
      next.ease_factor,
      next.next_review_at,
      next.learned_until,
      next.last_reviewed_at,
      next.last_reviewed_at,
      cardId,
      profileId,
    );

    return fetchReviewCardRow(db, profileId, cardId);
  });

  return buildCardPresentation(mark(), now);
}

export function deleteVocabularyEntry(db, profileId, entryId) {
  const result = db.prepare(
    'DELETE FROM vocabulary WHERE id = ? AND profile_id = ?'
  ).run(entryId, profileId);

  if (result.changes === 0) {
    throw new VocabularyApiError(404, 'Vocabulary entry not found', 'VOCAB_NOT_FOUND');
  }

  return { success: true };
}

function normalizeImportEntry(payload = {}, now = new Date()) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new VocabularyApiError(400, 'Each imported entry must be an object', 'INVALID_IMPORT_ENTRY');
  }

  const baseEntry = validateVocabularyInput(payload);
  const createdAt = sanitizeImportedTimestamp(payload.created_at, now);
  const rawCards = payload.cards ?? {};
  const normalizedCards = {};

  const cardsByDirection = Array.isArray(rawCards)
    ? Object.fromEntries(rawCards
      .filter((card) => card && typeof card === 'object' && typeof card.direction === 'string')
      .map((card) => [card.direction, card]))
    : rawCards;

  for (const direction of REVIEW_CARD_DIRECTIONS) {
    if (cardsByDirection[direction]) {
      normalizedCards[direction] = normalizeImportedCard(cardsByDirection[direction], direction, now);
    }
  }

  return {
    ...baseEntry,
    created_at: createdAt,
    cards: normalizedCards,
  };
}

function normalizeImportedCard(card, direction, now = new Date()) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) {
    throw new VocabularyApiError(400, `Card snapshot for ${direction} must be an object`, 'INVALID_IMPORT_CARD');
  }

  const normalizedDirection = typeof card.direction === 'string' ? card.direction.trim() : direction;
  if (normalizedDirection !== direction || !REVIEW_CARD_DIRECTIONS.includes(direction)) {
    throw new VocabularyApiError(400, `Invalid card direction: ${normalizedDirection}`, 'INVALID_IMPORT_CARD_DIRECTION');
  }

  const reviewCount = Math.max(0, Number.parseInt(card.review_count, 10) || 0);
  const lapseCount = Math.max(0, Number.parseInt(card.lapse_count, 10) || 0);
  const intervalDays = clamp(Number(card.interval_days) || 0, 0, 36500);
  const easeFactor = clamp(Number(card.ease_factor) || DEFAULT_EASE_FACTOR, 1.3, 3.8);
  const lastReviewedAt = sanitizeImportedTimestamp(card.last_reviewed_at, now);
  const createdAt = sanitizeImportedTimestamp(card.created_at, now);
  const nextReviewAt = deriveImportedNextReviewAt(intervalDays, lastReviewedAt, now);
  const learnedUntil = card.learned_until && new Date(nextReviewAt).getTime() > now.getTime()
    ? nextReviewAt
    : null;
  const updatedAt = sanitizeImportedTimestamp(card.updated_at, now, {
    fallback: lastReviewedAt ?? createdAt ?? now,
  }) ?? toIso(now);
  const state = REVIEW_CARD_STATES.includes(card.state) ? card.state : 'new';

  return {
    direction,
    state,
    review_count: reviewCount,
    lapse_count: lapseCount,
    interval_days: intervalDays,
    ease_factor: easeFactor,
    next_review_at: learnedUntil ?? nextReviewAt,
    learned_until: learnedUntil,
    last_reviewed_at: lastReviewedAt,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function getCardRecency(card) {
  const lastReviewed = card.last_reviewed_at ? new Date(card.last_reviewed_at).getTime() : Number.NEGATIVE_INFINITY;
  const updatedAt = card.updated_at ? new Date(card.updated_at).getTime() : Number.NEGATIVE_INFINITY;
  return Math.max(lastReviewed, updatedAt);
}

function getCardProgressScore(card) {
  const stateWeight = card.learned_until
    ? 4
    : card.state === 'review'
      ? 3
      : card.state === 'learning'
        ? 2
        : 1;

  return (
    ((Number(card.review_count) || 0) * 100000)
    + ((Number(card.interval_days) || 0) * 100)
    + (stateWeight * 10)
    + (Number(card.lapse_count) || 0)
  );
}

function choosePreferredCardSnapshot(existingCard, importedCard) {
  if (!existingCard) {
    return importedCard;
  }
  if (!importedCard) {
    return existingCard;
  }

  const importedRecency = getCardRecency(importedCard);
  const existingRecency = getCardRecency(existingCard);
  if (importedRecency > existingRecency) {
    return importedCard;
  }
  if (existingRecency > importedRecency) {
    return existingCard;
  }

  return getCardProgressScore(importedCard) > getCardProgressScore(existingCard)
    ? importedCard
    : existingCard;
}

function mergeImportedEntries(currentEntry, nextEntry) {
  return {
    ...currentEntry,
    example: currentEntry.example || nextEntry.example,
    created_at: currentEntry.created_at ?? nextEntry.created_at,
    cards: {
      source_to_target: choosePreferredCardSnapshot(
        currentEntry.cards.source_to_target,
        nextEntry.cards.source_to_target,
      ),
      target_to_source: choosePreferredCardSnapshot(
        currentEntry.cards.target_to_source,
        nextEntry.cards.target_to_source,
      ),
    },
  };
}

function updateVocabularyExample(db, profileId, entryId, example) {
  db.prepare(`
    UPDATE vocabulary
    SET example = ?
    WHERE id = ? AND profile_id = ?
  `).run(example, entryId, profileId);
}

function applyImportedCardSnapshot(db, profileId, entryId, cardSnapshot, now = new Date()) {
  if (!cardSnapshot) {
    return false;
  }

  const existingCard = fetchEntryReviewCardRow(db, profileId, entryId, cardSnapshot.direction);
  const selectedSnapshot = choosePreferredCardSnapshot(existingCard, cardSnapshot);
  if (selectedSnapshot === existingCard) {
    return false;
  }

  const lastReviewedAt = selectedSnapshot.last_reviewed_at ? toIso(selectedSnapshot.last_reviewed_at, now) : null;
  const createdAt = selectedSnapshot.created_at ? toIso(selectedSnapshot.created_at, now) : (existingCard.created_at ? toIso(existingCard.created_at, now) : toIso(now));
  const updatedAt = selectedSnapshot.updated_at ? toIso(selectedSnapshot.updated_at, now) : (lastReviewedAt ?? toIso(now));

  db.prepare(`
    UPDATE vocabulary_review_cards
    SET state = ?,
        review_count = ?,
        lapse_count = ?,
        interval_days = ?,
        ease_factor = ?,
        next_review_at = ?,
        learned_until = ?,
        last_reviewed_at = ?,
        created_at = ?,
        updated_at = ?
    WHERE vocabulary_id = ? AND profile_id = ? AND direction = ?
  `).run(
    selectedSnapshot.state,
    selectedSnapshot.review_count,
    selectedSnapshot.lapse_count,
    selectedSnapshot.interval_days,
    selectedSnapshot.ease_factor,
    selectedSnapshot.next_review_at,
    selectedSnapshot.learned_until,
    lastReviewedAt,
    createdAt,
    updatedAt,
    entryId,
    profileId,
    cardSnapshot.direction,
  );

  return true;
}

export function exportVocabularyArchive(db, profile, now = new Date()) {
  const vocabulary = listVocabularyEntries(db, profile.id, now);

  return {
    format: 'lingualearn-spanish-vocabulary',
    version: VOCABULARY_EXPORT_FORMAT_VERSION,
    exported_at: toIso(now),
    profile: {
      id: profile.id,
      name: profile.name,
      avatar_emoji: profile.avatar_emoji,
    },
    stats: vocabulary.stats,
    entries: vocabulary.entries.map((entry) => ({
      word: entry.word,
      translation: entry.translation,
      example: entry.example,
      created_at: entry.created_at,
      cards: Object.fromEntries(entry.cards.map((card) => [card.direction, {
        direction: card.direction,
        state: card.state,
        review_count: card.review_count,
        lapse_count: card.lapse_count,
        interval_days: card.interval_days,
        ease_factor: card.ease_factor,
        next_review_at: card.next_review_at,
        learned_until: card.learned_until,
        last_reviewed_at: card.last_reviewed_at,
        created_at: card.created_at,
        updated_at: card.updated_at,
      }])),
    })),
  };
}

export function importVocabularyArchive(db, profileId, payload, now = new Date()) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new VocabularyApiError(400, 'Import payload must be a JSON object', 'INVALID_IMPORT_PAYLOAD');
  }

  if (payload.format !== 'lingualearn-spanish-vocabulary') {
    throw new VocabularyApiError(400, 'Unsupported vocabulary import format', 'INVALID_IMPORT_FORMAT');
  }

  if (payload.version !== VOCABULARY_EXPORT_FORMAT_VERSION) {
    throw new VocabularyApiError(
      400,
      `Unsupported vocabulary import version: ${payload.version}`,
      'UNSUPPORTED_IMPORT_VERSION',
    );
  }

  if (!Array.isArray(payload.entries)) {
    throw new VocabularyApiError(400, 'Import payload must include an entries array', 'INVALID_IMPORT_ENTRIES');
  }

  const mergedImportEntries = new Map();
  let payloadDuplicateCount = 0;

  for (const rawEntry of payload.entries) {
    const entry = normalizeImportEntry(rawEntry, now);
    const key = buildVocabularyExactDuplicateKey(entry.word, entry.translation);
    if (mergedImportEntries.has(key)) {
      payloadDuplicateCount += 1;
      mergedImportEntries.set(key, mergeImportedEntries(mergedImportEntries.get(key), entry));
    } else {
      mergedImportEntries.set(key, entry);
    }
  }

  const importEntries = Array.from(mergedImportEntries.values());

  const importTransaction = db.transaction(() => {
    const summary = {
      imported_entries: importEntries.length,
      created_entries: 0,
      merged_entries: 0,
      updated_examples: 0,
      updated_cards: 0,
      kept_existing_cards: 0,
      payload_duplicates_merged: payloadDuplicateCount,
    };

      for (const entry of importEntries) {
        let existing = db.prepare(`
          SELECT id, example
          FROM vocabulary
          WHERE profile_id = ?
          AND word_key = ?
          AND translation_key = ?
      `).get(profileId, buildVocabularyTextKey(entry.word), buildVocabularyTextKey(entry.translation));

      if (!existing) {
        const entryId = insertVocabularyEntryRow(db, profileId, entry, now);
        existing = { id: entryId, example: entry.example };
        summary.created_entries += 1;
      } else {
        summary.merged_entries += 1;
      }

      if (!hasNonEmptyText(existing.example) && hasNonEmptyText(entry.example)) {
        updateVocabularyExample(db, profileId, existing.id, entry.example);
        summary.updated_examples += 1;
      }

      for (const direction of REVIEW_CARD_DIRECTIONS) {
        if (!entry.cards[direction]) {
          continue;
        }

        const updated = applyImportedCardSnapshot(db, profileId, existing.id, entry.cards[direction], now);
        if (updated) {
          summary.updated_cards += 1;
        } else {
          summary.kept_existing_cards += 1;
        }
      }
    }

    return summary;
  });

  return importTransaction();
}

function deriveLegacyLevelFromCard(card, now = new Date()) {
  if (!card || !card.is_reviewable) {
    return 0;
  }

  const learnedUntil = card.learned_until ? new Date(card.learned_until) : null;
  if (learnedUntil && !Number.isNaN(learnedUntil.getTime()) && learnedUntil.getTime() > now.getTime()) {
    return 5;
  }

  const intervalDays = Math.max(0, Number(card.interval_days) || 0);
  if (intervalDays >= 30) return 5;
  if (intervalDays >= 14) return 4;
  if (intervalDays >= 7) return 3;
  if (intervalDays >= 1) return 2;
  if (card.state === 'new') return 0;
  return 1;
}

function selectLegacyCompatibleCard(entry) {
  const reviewableCards = entry.cards.filter((card) => card.is_reviewable);
  if (reviewableCards.length === 0) {
    return entry.cards.find((card) => card.direction === 'source_to_target')
      ?? entry.cards[0]
      ?? null;
  }

  const dueCards = reviewableCards.filter((card) => card.is_due);
  if (dueCards.length > 0) {
    return [...dueCards].sort(compareDueCards)[0];
  }

  return reviewableCards.find((card) => card.direction === 'source_to_target')
    ?? [...reviewableCards].sort(compareDueCards)[0]
    ?? null;
}

function buildLegacyWordPresentation(entry, now = new Date()) {
  const primaryCard = selectLegacyCompatibleCard(entry);

  return {
    id: entry.id,
    profile_id: entry.profile_id,
    word: entry.word,
    translation: entry.translation,
    example: entry.example,
    level: deriveLegacyLevelFromCard(primaryCard, now),
    next_review: primaryCard?.next_review_at ?? null,
    review_count: primaryCard?.review_count ?? 0,
    last_reviewed: primaryCard?.last_reviewed_at ?? null,
    due: Boolean(primaryCard?.is_due),
    state: primaryCard?.status ?? 'new',
    card_id: primaryCard?.id ?? null,
    reviewable: Boolean(primaryCard?.is_reviewable),
    needs_completion: entry.needs_completion,
    created_at: entry.created_at,
  };
}

function fetchEntryReviewCardRow(db, profileId, entryId, direction = 'source_to_target') {
  const card = db.prepare(`
    SELECT
      c.*,
      v.word,
      v.translation,
      v.example
    FROM vocabulary_review_cards c
    JOIN vocabulary v ON v.id = c.vocabulary_id
    WHERE c.vocabulary_id = ? AND c.profile_id = ? AND c.direction = ?
  `).get(entryId, profileId, direction);

  if (!card) {
    throw new VocabularyApiError(404, 'Vocabulary entry not found', 'VOCAB_NOT_FOUND');
  }

  return card;
}

function normalizeLegacyGrade(payload = {}) {
  if (typeof payload.grade === 'string' && REVIEW_GRADES.includes(payload.grade.trim())) {
    return payload.grade.trim();
  }

  const parsedQuality = Number.parseInt(payload.quality, 10);
  if (Number.isFinite(parsedQuality)) {
    switch (parsedQuality) {
      case 0:
        return 'dont_know';
      case 1:
        return 'hard';
      case 2:
        return 'good';
      case 3:
        return 'easy';
      default:
        break;
    }
  }

  throw new VocabularyApiError(
    400,
    'Provide either a v2 grade (dont_know, hard, good, easy) or a legacy quality (0-3).',
    'INVALID_GRADE',
  );
}

export function listLegacyVocabularyWords(db, profileId, now = new Date()) {
  return listVocabularyEntries(db, profileId, now).entries.map((entry) => buildLegacyWordPresentation(entry, now));
}

export function listLegacyDueVocabularyWords(db, profileId, now = new Date()) {
  return listLegacyVocabularyWords(db, profileId, now)
    .filter((word) => word.reviewable && word.due)
    .sort((left, right) => {
      return compareDueCards(
        {
          id: left.card_id,
          state: left.state === 'learned' || left.state === 'snoozed' ? 'review' : left.state,
          next_review_at: left.next_review,
          review_count: left.review_count,
        },
        {
          id: right.card_id,
          state: right.state === 'learned' || right.state === 'snoozed' ? 'review' : right.state,
          next_review_at: right.next_review,
          review_count: right.review_count,
        },
      ) || left.id - right.id;
    });
}

export function reviewLegacyVocabularyEntry(db, profileId, entryId, payload = {}, now = new Date()) {
  const direction = typeof payload.direction === 'string' && REVIEW_CARD_DIRECTIONS.includes(payload.direction.trim())
    ? payload.direction.trim()
    : null;
  const card = direction
    ? fetchEntryReviewCardRow(db, profileId, entryId, direction)
    : selectLegacyCompatibleCard(fetchEntryById(db, profileId, entryId, now));

  if (!card) {
    throw new VocabularyApiError(404, 'Vocabulary entry not found', 'VOCAB_NOT_FOUND');
  }

  const updatedCard = reviewVocabularyCard(db, profileId, card.id, normalizeLegacyGrade(payload), now);
  const entry = fetchEntryById(db, profileId, entryId, now);

  return {
    ...buildLegacyWordPresentation(entry, now),
    review_card: updatedCard,
    entry,
  };
}

export function getVocabularyStats(db, profileId, now = new Date()) {
  return listVocabularyEntries(db, profileId, now).stats;
}

export function getVocabularyEntry(db, profileId, entryId, now = new Date()) {
  return fetchEntryById(db, profileId, entryId, now);
}
