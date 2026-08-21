import { A1_CORE_VOCABULARY, getA1VocabularyByDomain, getA1VocabularyByUnit } from './a1VocabularyData.js';
import { A1_CHECKPOINTS, getA1CheckpointByUnit, getAllA1Checkpoints } from './a1CheckpointsData.js';
import { A1_SKILL_TASKS, getA1SkillTasks, getA1SkillTaskById } from './a1SkillTasksData.js';

const DAY_MS = 86_400_000;
const EARLY_REVIEW_GRACE_MS = 24 * 60 * 60 * 1000;
const MINIMUM_MASTERY_SPAN_DAYS = 14;

export const A1_COURSE_VERSION = 1;
export const A1_CORE_VOCABULARY_TARGET = 650;
export const A1_SKILLS = Object.freeze(['listening', 'speaking', 'reading', 'writing']);

export const A1_UNITS = Object.freeze([
  {
    id: 'a1-u01-first-contact', order: 1, titleRu: 'Первый контакт',
    outcomeRu: 'Поздороваться, представиться, понять имя и простые числа.',
    topics: ['Greetings and introductions (saludos)', 'Subject pronouns (yo/tú/vos/él/ella)', 'Numbers and counting'],
  },
  {
    id: 'a1-u02-things', order: 2, titleRu: 'Предметы вокруг',
    outcomeRu: 'Назвать предметы, выбрать артикль, число и цвет.',
    topics: ['Gender and articles (el/la/los/las)', 'Indefinite articles (un/una/unos/unas)', 'Colors (colores)', 'Plural nouns (-s/-es)'],
  },
  {
    id: 'a1-u03-identity', order: 3, titleRu: 'Кто мы и какие мы',
    outcomeRu: 'Описать человека и состояние простыми фразами.',
    topics: ['Ser vs Estar (basic)', 'Basic adjective agreement (gender/number)', 'Describing people (describir personas)'],
  },
  {
    id: 'a1-u04-family', order: 4, titleRu: 'Семья и принадлежность',
    outcomeRu: 'Рассказать о семье, возрасте, обладании и внешности.',
    topics: ['Family members (la familia)', 'Possessive adjectives (mi/tu/su)', 'Tener (to have) and tener expressions', 'Parts of the body (el cuerpo)'],
  },
  {
    id: 'a1-u05-actions', order: 5, titleRu: 'Повседневные действия',
    outcomeRu: 'Строить простые утверждения, отрицания и вопросы.',
    topics: ['Present tense regular -ar verbs', 'Negation (no + verb)', 'Question formation (¿...?)'],
  },
  {
    id: 'a1-u06-calendar', order: 6, titleRu: 'Календарь и время',
    outcomeRu: 'Назвать дату и время, договориться о простом событии.',
    topics: ['Days, months, seasons', 'Asking and telling the time (la hora)', 'Numbers (0-1000)'],
  },
  {
    id: 'a1-u07-food', order: 7, titleRu: 'Еда и кафе',
    outcomeRu: 'Понять простое меню и сделать заказ.',
    topics: ['Present tense regular -er/-ir verbs', 'Basic food and drinks (comida y bebida)', 'Ordering food (pedir comida)'],
  },
  {
    id: 'a1-u08-home', order: 8, titleRu: 'Дом и пространство',
    outcomeRu: 'Описать комнату, наличие и положение предметов.',
    topics: ['Hay (there is / there are)', 'Prepositions of place (en/sobre/debajo de)', 'House and furniture (la casa)', 'Demonstratives (este/ese/aquel)'],
  },
  {
    id: 'a1-u09-needs', order: 9, titleRu: 'Планы, вкусы и одежда',
    outcomeRu: 'Сказать, куда идёшь, что делаешь, любишь и носишь.',
    topics: ['Present tense irregular verbs (ir/hacer/decir)', 'Gustar and similar verbs', 'Clothes (la ropa)'],
  },
]);

export const A1_VOCABULARY_DOMAINS = Object.freeze([
  ['identity', 'Личные данные и приветствия', 45, 'a1-u01-first-contact'],
  ['numbers-time', 'Числа, время и календарь', 55, 'a1-u06-calendar'],
  ['people-family', 'Люди, семья и тело', 65, 'a1-u04-family'],
  ['home-city', 'Дом, город и места', 65, 'a1-u08-home'],
  ['food', 'Еда и кафе', 70, 'a1-u07-food'],
  ['daily-actions', 'Базовые действия и распорядок', 75, 'a1-u05-actions'],
  ['descriptions', 'Описание, цвета и качества', 55, 'a1-u03-identity'],
  ['clothes-shopping', 'Одежда и простые покупки', 50, 'a1-u09-needs'],
  ['transport-directions', 'Транспорт и ориентирование', 45, 'a1-u08-home'],
  ['weather-leisure', 'Погода и досуг', 45, 'a1-u09-needs'],
  ['function-words', 'Служебные слова и связки', 45, 'a1-u05-actions'],
  ['survival-phrases', 'Фразы выживания и вежливость', 35, 'a1-u01-first-contact'],
]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const iso = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  return date.toISOString();
};
const addDays = (value, days) => new Date(new Date(value).getTime() + (days * DAY_MS)).toISOString();

function columns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
}

export function ensureA1CourseSchema(db) {
  const topicColumns = columns(db, 'curriculum_topics');
  const progressColumns = columns(db, 'curriculum_progress');
  if (!topicColumns.has('pedagogical_order')) {
    db.exec('ALTER TABLE curriculum_topics ADD COLUMN pedagogical_order INTEGER');
  }
  if (!progressColumns.has('is_locked')) {
    db.exec('ALTER TABLE curriculum_progress ADD COLUMN is_locked INTEGER DEFAULT 0');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS a1_topic_mastery (\n      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      topic_id INTEGER NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE,
      phase TEXT NOT NULL DEFAULT 'new' CHECK (phase IN ('new','learning','review','relearning','mastered')),
      mastery_score REAL NOT NULL DEFAULT 0,
      stability_days REAL NOT NULL DEFAULT 0,
      difficulty REAL NOT NULL DEFAULT 5,
      repetitions INTEGER NOT NULL DEFAULT 0,
      lapses INTEGER NOT NULL DEFAULT 0,
      successful_days INTEGER NOT NULL DEFAULT 0,
      last_quality INTEGER,
      last_review_at TEXT,
      next_review_at TEXT,
      mastered_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (profile_id, topic_id)
    );
    CREATE INDEX IF NOT EXISTS idx_a1_mastery_due
      ON a1_topic_mastery(profile_id, next_review_at, phase);

    CREATE TABLE IF NOT EXISTS a1_learning_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      topic_id INTEGER NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL,
      correct INTEGER NOT NULL CHECK (correct IN (0,1)),
      quality INTEGER NOT NULL CHECK (quality BETWEEN 0 AND 5),
      activity_type TEXT NOT NULL,
      hints_used INTEGER NOT NULL DEFAULT 0,
      response_ms INTEGER,
      occurred_at TEXT NOT NULL,
      retention_credit INTEGER NOT NULL DEFAULT 1 CHECK (retention_credit IN (0,1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(profile_id, event_id)
    );
    CREATE INDEX IF NOT EXISTS idx_a1_attempts_topic_time
      ON a1_learning_attempts(profile_id, topic_id, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS a1_skill_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL,
      skill TEXT NOT NULL CHECK (skill IN ('listening','speaking','reading','writing')),
      task_id TEXT NOT NULL,
      score REAL NOT NULL CHECK (score BETWEEN 0 AND 100),
      passed INTEGER NOT NULL CHECK (passed IN (0,1)),
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(profile_id, event_id)
    );
    CREATE INDEX IF NOT EXISTS idx_a1_skill_profile
      ON a1_skill_evidence(profile_id, skill, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS a1_vocabulary_blueprint (
      domain_id TEXT PRIMARY KEY,
      title_ru TEXT NOT NULL,
      target_count INTEGER NOT NULL,
      unit_id TEXT NOT NULL,
      course_version INTEGER NOT NULL DEFAULT 1
    );
  `);

  const masteryColumns = columns(db, 'a1_topic_mastery');
  if (!masteryColumns.has('first_learning_at')) db.exec('ALTER TABLE a1_topic_mastery ADD COLUMN first_learning_at TEXT');
  if (!masteryColumns.has('retention_reviews')) db.exec('ALTER TABLE a1_topic_mastery ADD COLUMN retention_reviews INTEGER NOT NULL DEFAULT 0');
  const attemptColumns = columns(db, 'a1_learning_attempts');
  if (!attemptColumns.has('retention_credit')) db.exec('ALTER TABLE a1_learning_attempts ADD COLUMN retention_credit INTEGER NOT NULL DEFAULT 1');
  db.exec(`
    UPDATE a1_topic_mastery
    SET first_learning_at = COALESCE(first_learning_at, (
      SELECT MIN(a.occurred_at) FROM a1_learning_attempts a
      WHERE a.profile_id = a1_topic_mastery.profile_id AND a.topic_id = a1_topic_mastery.topic_id
    ), last_review_at)
    WHERE first_learning_at IS NULL;
    UPDATE a1_topic_mastery
    SET retention_reviews = (
      SELECT COUNT(*) FROM a1_learning_attempts a
      WHERE a.profile_id = a1_topic_mastery.profile_id
        AND a.topic_id = a1_topic_mastery.topic_id
        AND a.correct = 1 AND a.quality >= 3 AND COALESCE(a.retention_credit, 1) = 1
    )
    WHERE retention_reviews = 0;
  `);

  const cardColumns = columns(db, 'vocabulary_review_cards');
  if (cardColumns.size > 0) {
    if (!cardColumns.has('direction')) db.exec('ALTER TABLE vocabulary_review_cards ADD COLUMN direction TEXT NOT NULL DEFAULT \'source_to_target\'');
    if (!cardColumns.has('state')) db.exec('ALTER TABLE vocabulary_review_cards ADD COLUMN state TEXT NOT NULL DEFAULT \'new\'');
    if (!cardColumns.has('review_count')) db.exec('ALTER TABLE vocabulary_review_cards ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0');
    if (!cardColumns.has('lapse_count')) db.exec('ALTER TABLE vocabulary_review_cards ADD COLUMN lapse_count INTEGER NOT NULL DEFAULT 0');
    if (!cardColumns.has('interval_days')) db.exec('ALTER TABLE vocabulary_review_cards ADD COLUMN interval_days REAL NOT NULL DEFAULT 0');
    if (!cardColumns.has('ease_factor')) db.exec('ALTER TABLE vocabulary_review_cards ADD COLUMN ease_factor REAL NOT NULL DEFAULT 2.3');
    if (!cardColumns.has('next_review_at')) db.exec('ALTER TABLE vocabulary_review_cards ADD COLUMN next_review_at TEXT');
    if (!cardColumns.has('created_at')) db.exec('ALTER TABLE vocabulary_review_cards ADD COLUMN created_at TEXT');
    if (!cardColumns.has('updated_at')) db.exec('ALTER TABLE vocabulary_review_cards ADD COLUMN updated_at TEXT');
  }

  const vocabularyColumns = columns(db, 'vocabulary');
  if (!vocabularyColumns.has('level')) db.exec('ALTER TABLE vocabulary ADD COLUMN level INTEGER DEFAULT 0');
  if (!vocabularyColumns.has('next_review')) db.exec('ALTER TABLE vocabulary ADD COLUMN next_review TEXT');
  if (!vocabularyColumns.has('review_count')) db.exec('ALTER TABLE vocabulary ADD COLUMN review_count INTEGER DEFAULT 0');
  if (!vocabularyColumns.has('word')) db.exec('ALTER TABLE vocabulary ADD COLUMN word TEXT');
  if (!vocabularyColumns.has('word_key')) db.exec('ALTER TABLE vocabulary ADD COLUMN word_key TEXT');
  if (!vocabularyColumns.has('translation')) db.exec('ALTER TABLE vocabulary ADD COLUMN translation TEXT');
  if (!vocabularyColumns.has('translation_key')) db.exec('ALTER TABLE vocabulary ADD COLUMN translation_key TEXT');
  if (!vocabularyColumns.has('example')) db.exec('ALTER TABLE vocabulary ADD COLUMN example TEXT');
  if (!vocabularyColumns.has('cefr_level')) db.exec('ALTER TABLE vocabulary ADD COLUMN cefr_level TEXT');
  if (!vocabularyColumns.has('course_domain')) db.exec('ALTER TABLE vocabulary ADD COLUMN course_domain TEXT');
  if (!vocabularyColumns.has('course_unit_id')) db.exec('ALTER TABLE vocabulary ADD COLUMN course_unit_id TEXT');
  if (!vocabularyColumns.has('is_core_a1')) db.exec('ALTER TABLE vocabulary ADD COLUMN is_core_a1 INTEGER NOT NULL DEFAULT 0');
  if (!vocabularyColumns.has('part_of_speech')) db.exec('ALTER TABLE vocabulary ADD COLUMN part_of_speech TEXT');
  if (!vocabularyColumns.has('gender')) db.exec('ALTER TABLE vocabulary ADD COLUMN gender TEXT');
  if (!vocabularyColumns.has('base_form')) db.exec('ALTER TABLE vocabulary ADD COLUMN base_form TEXT');
  if (!vocabularyColumns.has('example_translation')) db.exec('ALTER TABLE vocabulary ADD COLUMN example_translation TEXT');
  if (!vocabularyColumns.has('notes')) db.exec('ALTER TABLE vocabulary ADD COLUMN notes TEXT');

  db.exec('CREATE INDEX IF NOT EXISTS idx_vocabulary_a1_coverage ON vocabulary(profile_id, is_core_a1, course_domain)');

  const upsert = db.prepare(`
    INSERT INTO a1_vocabulary_blueprint (domain_id, title_ru, target_count, unit_id, course_version)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(domain_id) DO UPDATE SET
      title_ru = excluded.title_ru, target_count = excluded.target_count,
      unit_id = excluded.unit_id, course_version = excluded.course_version
  `);
  db.transaction(() => {
    for (const [id, title, target, unitId] of A1_VOCABULARY_DOMAINS) {
      upsert.run(id, title, target, unitId, A1_COURSE_VERSION);
    }
  })();
}

export function seedCoreA1Vocabulary(db, profileId) {
  ensureA1CourseSchema(db);

  const selectExisting = db.prepare(`
    SELECT id FROM vocabulary WHERE profile_id = ? AND word_key = ? AND translation_key = ?
  `);

  const insertVocab = db.prepare(`
    INSERT INTO vocabulary (
      word, word_key, translation, translation_key, example, example_translation,
      part_of_speech, gender, base_form, notes, cefr_level, course_domain,
      course_unit_id, is_core_a1, profile_id, level, next_review, review_count
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, CURRENT_TIMESTAMP, 0)
  `);

  const updateVocab = db.prepare(`
    UPDATE vocabulary SET
      cefr_level = ?, course_domain = ?, course_unit_id = ?, is_core_a1 = 1,
      part_of_speech = ?, gender = ?, base_form = ?, example_translation = ?, notes = ?
    WHERE id = ?
  `);

  const insertCard = db.prepare(`
    INSERT OR IGNORE INTO vocabulary_review_cards (
      vocabulary_id, profile_id, direction, state, review_count, lapse_count,
      interval_days, ease_factor, next_review_at, created_at, updated_at
    )
    VALUES (?, ?, ?, 'new', 0, 0, 0, 2.3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  return db.transaction(() => {
    let count = 0;
    for (const item of A1_CORE_VOCABULARY) {
      const wordKey = String(item.word).toLowerCase().trim();
      const translationKey = String(item.translation).toLowerCase().trim();
      const existing = selectExisting.get(profileId, wordKey, translationKey);
      let vocabId;

      if (existing) {
        vocabId = existing.id;
        updateVocab.run(
          item.cefr_level, item.course_domain, item.course_unit_id,
          item.part_of_speech, item.gender, item.base_form, item.example_translation, item.notes,
          vocabId
        );
      } else {
        const res = insertVocab.run(
          item.word, wordKey, item.translation, translationKey, item.example,
          item.example_translation, item.part_of_speech, item.gender, item.base_form,
          item.notes, item.cefr_level, item.course_domain, item.course_unit_id, profileId
        );
        vocabId = res.lastInsertRowid;
      }

      if (vocabId) {
        insertCard.run(vocabId, profileId, 'source_to_target');
        insertCard.run(vocabId, profileId, 'target_to_source');
        count++;
      }
    }
    return { profileId, seededCount: count };
  })();
}

function a1Topics(db) {
  return db.prepare(`
    SELECT id, name, category, level, COALESCE(pedagogical_order, id) AS pedagogical_order
    FROM curriculum_topics
    WHERE level = 'A1' AND COALESCE(source, 'preset') = 'preset'
    ORDER BY COALESCE(pedagogical_order, id), id
  `).all();
}

function ensureState(db, profileId, topic) {
  const found = db.prepare('SELECT * FROM a1_topic_mastery WHERE profile_id = ? AND topic_id = ?').get(profileId, topic.id);
  if (found) return found;
  const legacy = db.prepare('SELECT * FROM curriculum_progress WHERE profile_id = ? AND topic_id = ?').get(profileId, topic.id);
  const repetitions = Math.max(0, Number(legacy?.success_count || 0) + Number(legacy?.failure_count || 0));
  const seedScore = repetitions ? clamp(Math.round(Number(legacy?.score || 0) * 0.6), 5, 60) : 0;
  db.prepare(`
    INSERT INTO a1_topic_mastery
      (profile_id, topic_id, phase, mastery_score, repetitions, lapses, next_review_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(profileId, topic.id, repetitions ? 'learning' : 'new', seedScore, repetitions, Number(legacy?.failure_count || 0), repetitions ? new Date().toISOString() : null);
  return db.prepare('SELECT * FROM a1_topic_mastery WHERE profile_id = ? AND topic_id = ?').get(profileId, topic.id);
}

function publicState(row, topic, now = new Date()) {
  const learningSpanDays = row.first_learning_at
    ? Math.max(0, Math.floor((now.getTime() - new Date(row.first_learning_at).getTime()) / DAY_MS))
    : 0;
  return {
    topicId: topic.id,
    name: topic.name,
    category: topic.category,
    phase: row.phase,
    masteryScore: Math.round(Number(row.mastery_score || 0)),
    stabilityDays: Math.round(Number(row.stability_days || 0) * 10) / 10,
    difficulty: Math.round(Number(row.difficulty || 5) * 10) / 10,
    repetitions: Number(row.repetitions || 0),
    lapses: Number(row.lapses || 0),
    successfulDays: Number(row.successful_days || 0),
    retentionReviews: Number(row.retention_reviews || 0),
    practiceOnlyAttempts: Math.max(0, Number(row.repetitions || 0) - Number(row.retention_reviews || 0)),
    firstLearningAt: row.first_learning_at,
    learningSpanDays,
    lastQuality: row.last_quality === null ? null : Number(row.last_quality),
    lastReviewAt: row.last_review_at,
    nextReviewAt: row.next_review_at,
    masteredAt: row.mastered_at,
    due: Boolean(row.next_review_at && new Date(row.next_review_at) <= now),
  };
}

function deriveQuality(input) {
  if (Number.isInteger(input.quality)) return clamp(input.quality, 0, 5);
  if (!input.correct) return 1;
  if (Number(input.hintsUsed) > 0) return 3;
  if (Number(input.responseMs) > 0 && Number(input.responseMs) < 7000) return 5;
  return 4;
}

export function recordA1Attempt(db, profileId, input, now = new Date()) {
  ensureA1CourseSchema(db);
  const topicId = Number(input?.topicId);
  const topic = db.prepare("SELECT id, name, category, level FROM curriculum_topics WHERE id = ? AND level = 'A1' AND COALESCE(source, 'preset') = 'preset'").get(topicId);
  if (!topic) throw Object.assign(new Error('A1 topic not found'), { status: 404, code: 'A1_TOPIC_NOT_FOUND' });
  const eventId = String(input?.eventId || '').trim();
  if (!eventId || eventId.length > 160) throw Object.assign(new Error('eventId is required (max 160 chars)'), { status: 400, code: 'INVALID_EVENT_ID' });
  if (typeof input.correct !== 'boolean') throw Object.assign(new Error('correct must be boolean'), { status: 400, code: 'INVALID_CORRECT' });

  const quality = deriveQuality(input);
  const occurredAt = iso(now);
  const activityType = String(input.activityType || 'exercise').slice(0, 40);
  const hintsUsed = clamp(Math.round(Number(input.hintsUsed || 0)), 0, 20);
  const responseMs = Number.isFinite(Number(input.responseMs)) ? clamp(Math.round(Number(input.responseMs)), 0, 3_600_000) : null;

  return db.transaction(() => {
    const duplicate = db.prepare('SELECT topic_id FROM a1_learning_attempts WHERE profile_id = ? AND event_id = ?').get(profileId, eventId);
    if (duplicate) {
      const replayTopic = db.prepare('SELECT id, name, category FROM curriculum_topics WHERE id = ?').get(duplicate.topic_id);
      return { replayed: true, state: publicState(ensureState(db, profileId, replayTopic), replayTopic, now) };
    }
    const previous = ensureState(db, profileId, topic);
    const scheduledAt = previous.next_review_at ? new Date(previous.next_review_at).getTime() : null;
    const correctForRetention = input.correct && quality >= 3;
    const retentionCredit = correctForRetention && (
      !previous.last_review_at
      || scheduledAt === null
      || now.getTime() >= scheduledAt - EARLY_REVIEW_GRACE_MS
    );
    db.prepare(`
      INSERT INTO a1_learning_attempts
        (profile_id, topic_id, event_id, correct, quality, activity_type, hints_used, response_ms, occurred_at, retention_credit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(profileId, topicId, eventId, input.correct ? 1 : 0, quality, activityType, hintsUsed, responseMs, occurredAt, retentionCredit ? 1 : 0);

    const recent = db.prepare(`
      SELECT correct FROM a1_learning_attempts
      WHERE profile_id = ? AND topic_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 12
    `).all(profileId, topicId);
    const successfulDays = Number(db.prepare(`
      SELECT COUNT(DISTINCT date(occurred_at)) AS count FROM a1_learning_attempts
      WHERE profile_id = ? AND topic_id = ? AND correct = 1 AND quality >= 3 AND retention_credit = 1
    `).get(profileId, topicId).count);
    const repetitions = Number(previous.repetitions || 0) + 1;
    const retentionReviews = Number(previous.retention_reviews || 0) + (retentionCredit ? 1 : 0);
    const lapses = Number(previous.lapses || 0) + (input.correct ? 0 : 1);
    const difficulty = retentionCredit || !input.correct
      ? clamp(Number(previous.difficulty || 5) + ((3 - quality) * 0.45), 1, 10)
      : Number(previous.difficulty || 5);
    let stability = Number(previous.stability_days || 0);
    let phase = previous.phase;
    if (!input.correct || quality < 3) {
      stability = Math.max(0.25, Number(previous.stability_days || 0) * 0.35);
      phase = 'relearning';
    } else if (!retentionCredit) {
      phase = previous.phase === 'new' ? 'learning' : previous.phase;
    } else if (Number(previous.stability_days || 0) < 1) {
      stability = quality >= 5 ? 1.5 : 1;
      phase = 'learning';
    } else {
      const growth = clamp(1.65 + ((6 - difficulty) * 0.08) + ((quality - 3) * 0.18), 1.25, 2.25);
      stability = clamp(Number(previous.stability_days) * growth, 1, 60);
      phase = retentionReviews >= 3 ? 'review' : 'learning';
    }

    const accuracy = recent.reduce((sum, row) => sum + Number(row.correct), 0) / Math.max(1, recent.length);
    const firstLearningAt = previous.first_learning_at || occurredAt;
    const learningSpanDays = Math.max(0, Math.floor((now.getTime() - new Date(firstLearningAt).getTime()) / DAY_MS));
    const masteryScore = clamp(Math.round(
      Math.min(15, repetitions * 2.5)
      + Math.min(30, retentionReviews * 6)
      + Math.min(20, successfulDays * 5)
      + Math.min(20, (stability / 14) * 20)
      + (accuracy * 15)
      - Math.min(20, lapses * 2)
    ), 0, 100);
    if (retentionCredit && repetitions >= 6 && retentionReviews >= 4 && successfulDays >= 4
      && learningSpanDays >= MINIMUM_MASTERY_SPAN_DAYS && stability >= 14 && masteryScore >= 85) {
      phase = 'mastered';
    }
    const interval = (!input.correct || quality < 3) ? 0.25 : clamp(stability * (quality >= 5 ? 1.15 : 1), 1, 60);
    const nextReviewAt = retentionCredit || !input.correct
      ? addDays(now, phase === 'mastered' ? Math.max(30, interval) : interval)
      : previous.next_review_at;
    const masteredAt = phase === 'mastered' ? (previous.mastered_at || occurredAt) : null;

    db.prepare(`
      UPDATE a1_topic_mastery SET
        phase = ?, mastery_score = ?, stability_days = ?, difficulty = ?, repetitions = ?, lapses = ?,
        successful_days = ?, retention_reviews = ?, first_learning_at = ?, last_quality = ?, last_review_at = ?, next_review_at = ?, mastered_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE profile_id = ? AND topic_id = ?
    `).run(phase, masteryScore, stability, difficulty, repetitions, lapses, successfulDays, retentionReviews, firstLearningAt, quality, occurredAt, nextReviewAt, masteredAt, profileId, topicId);

    db.prepare(`
      INSERT INTO curriculum_progress
        (topic_id, profile_id, status, score, success_count, failure_count, last_practiced, is_locked)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(topic_id, profile_id) DO UPDATE SET
        status = excluded.status, score = excluded.score,
        success_count = curriculum_progress.success_count + excluded.success_count,
        failure_count = curriculum_progress.failure_count + excluded.failure_count,
        last_practiced = excluded.last_practiced, is_locked = 0
    `).run(topicId, profileId, phase === 'mastered' ? 'mastered' : 'in_progress', masteryScore, input.correct ? 1 : 0, input.correct ? 0 : 1, occurredAt);

    const row = db.prepare('SELECT * FROM a1_topic_mastery WHERE profile_id = ? AND topic_id = ?').get(profileId, topicId);
    return {
      replayed: false,
      quality,
      retentionCredit,
      feedbackRu: retentionCredit
        ? 'Попытка засчитана как интервальное повторение.'
        : 'Дополнительная практика засчитана, но обязательная дата повторения не переносится.',
      state: publicState(row, topic, now),
    };
  })();
}

function vocabularyCoverage(db, profileId, now = new Date()) {
  // Check if profile needs A1 vocabulary seeding
  const countRow = db.prepare('SELECT COUNT(*) AS c FROM vocabulary WHERE profile_id = ? AND is_core_a1 = 1').get(profileId);
  if (!countRow || countRow.c < A1_CORE_VOCABULARY_TARGET) {
    try {
      seedCoreA1Vocabulary(db, profileId);
    } catch (e) {
      console.warn('Auto-seed vocabulary warning:', e.message);
    }
  }

  const domains = db.prepare(`
    SELECT b.domain_id, b.title_ru, b.target_count, b.unit_id,
      COUNT(DISTINCT CASE WHEN introduced.vocabulary_id IS NOT NULL THEN v.id END) AS introduced,
      COUNT(DISTINCT CASE WHEN mature.vocabulary_id IS NOT NULL THEN v.id END) AS mature
    FROM a1_vocabulary_blueprint b
    LEFT JOIN vocabulary v ON v.profile_id = ? AND v.course_domain = b.domain_id
    LEFT JOIN (
      SELECT vocabulary_id FROM vocabulary_review_cards
      WHERE profile_id = ? AND review_count > 0
      GROUP BY vocabulary_id
    ) introduced ON introduced.vocabulary_id = v.id
    LEFT JOIN (
      SELECT vocabulary_id FROM vocabulary_review_cards
      WHERE profile_id = ? AND state = 'review' AND interval_days >= 14 AND review_count >= 4
      GROUP BY vocabulary_id HAVING COUNT(DISTINCT direction) = 2
    ) mature ON mature.vocabulary_id = v.id
    GROUP BY b.domain_id, b.title_ru, b.target_count, b.unit_id
    ORDER BY b.rowid
  `).all(profileId, profileId, profileId).map((row) => ({
    id: row.domain_id, titleRu: row.title_ru, target: Number(row.target_count),
    introduced: Number(row.introduced), mature: Number(row.mature), unitId: row.unit_id,
    percent: Math.min(100, Math.round((Number(row.mature) / Number(row.target_count)) * 100)),
  }));
  const introduced = domains.reduce((sum, row) => sum + row.introduced, 0);
  const mature = domains.reduce((sum, row) => sum + row.mature, 0);
  const due = Number(db.prepare(`
    SELECT COUNT(DISTINCT vocabulary_id) AS count FROM vocabulary_review_cards
    WHERE profile_id = ? AND state <> 'new' AND review_count > 0 AND next_review_at IS NOT NULL AND next_review_at <= ?
  `).get(profileId, iso(now)).count || 0);
  return { target: A1_CORE_VOCABULARY_TARGET, introduced, newAvailable: Math.max(0, A1_CORE_VOCABULARY_TARGET - introduced), mature, due, percent: Math.min(100, Math.round((mature / A1_CORE_VOCABULARY_TARGET) * 100)), domains };
}

function skillCoverage(db, profileId) {
  return A1_SKILLS.map((skill) => {
    const row = db.prepare(`
      SELECT COUNT(*) AS attempts, SUM(passed) AS passed,
        COUNT(DISTINCT CASE WHEN passed = 1 THEN date(occurred_at) END) AS passed_days,
        MAX(score) AS best_score
      FROM a1_skill_evidence WHERE profile_id = ? AND skill = ?
    `).get(profileId, skill);
    const passed = Number(row.passed || 0);
    const passedDays = Number(row.passed_days || 0);
    const bestScore = Number(row.best_score || 0);
    const complete = passed >= 3 && passedDays >= 2 && bestScore >= 70;
    const percent = complete ? 100 : Math.min(95, Math.round((Math.min(3, passed) / 3 * 60) + (Math.min(2, passedDays) / 2 * 25) + (Math.min(70, bestScore) / 70 * 15)));
    return { skill, attempts: Number(row.attempts || 0), passed, passedDays, bestScore, percent, complete };
  });
}

export function recordA1SkillEvidence(db, profileId, input, now = new Date()) {
  ensureA1CourseSchema(db);
  const skill = String(input?.skill || '');
  const eventId = String(input?.eventId || '').trim();
  const taskId = String(input?.taskId || '').trim();
  const score = Number(input?.score);
  if (!A1_SKILLS.includes(skill) || !eventId || eventId.length > 160 || !taskId || !Number.isFinite(score) || score < 0 || score > 100) {
    throw Object.assign(new Error('Valid skill, eventId, taskId and score 0..100 are required'), { status: 400, code: 'INVALID_SKILL_EVIDENCE' });
  }
  const passed = typeof input.passed === 'boolean' ? input.passed : score >= 70;
  const result = db.prepare(`
    INSERT OR IGNORE INTO a1_skill_evidence
      (profile_id, event_id, skill, task_id, score, passed, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(profileId, eventId, skill, taskId, score, passed ? 1 : 0, iso(now));
  return { replayed: result.changes === 0, skills: skillCoverage(db, profileId) };
}

export function recordA1CheckpointSubmission(db, profileId, unitId, input, now = new Date()) {
  ensureA1CourseSchema(db);
  const checkpoint = getA1CheckpointByUnit(unitId);
  if (!checkpoint) {
    throw Object.assign(new Error(`Checkpoint '${unitId}' not found`), { status: 404, code: 'CHECKPOINT_NOT_FOUND' });
  }

  const answers = Array.isArray(input?.answers) ? input.answers : [];
  const objectiveTasks = checkpoint.tasks.filter((task) => Array.isArray(task.options) && task.topicId);
  const answerByTask = new Map(answers.map((answer) => [String(answer.taskId || answer.id), answer]));
  if (objectiveTasks.some((task) => !answerByTask.has(String(task.id)))) {
    throw Object.assign(new Error('Ответьте на все проверяемые задания контрольной точки.'), { status: 400, code: 'INCOMPLETE_CHECKPOINT' });
  }

  return db.transaction(() => {
    const attemptResults = [];
    let correctCount = 0;
    for (const task of objectiveTasks) {
      const answer = answerByTask.get(String(task.id));
      const correct = String(answer.selected) === String(task.correctAnswer);
      if (correct) correctCount += 1;
      const attemptRes = recordA1Attempt(db, profileId, {
        topicId: Number(task.topicId),
        eventId: String(answer.eventId || `chk-${unitId}-${task.id}-${Date.now()}`),
        correct,
        quality: correct ? 4 : 1,
        activityType: `checkpoint_${unitId}`,
        hintsUsed: 0,
        responseMs: Number(answer.responseMs || 0),
      }, now);
      attemptResults.push(attemptRes);
    }
    const objectiveScore = Math.round((correctCount / Math.max(1, objectiveTasks.length)) * 100);

    const courseSnapshot = getA1CourseSnapshot(db, profileId, now);
    return {
      success: true,
      unitId,
      recordedAttempts: attemptResults.length,
      objectiveScore,
      passed: objectiveScore >= 70,
      skillEvidence: null,
      productiveEvaluationRequired: checkpoint.tasks.some((task) => task.type === 'productive_writing'),
      course: courseSnapshot,
    };
  })();
}

function unitFor(name) {
  return A1_UNITS.find((unit) => unit.topics.includes(name));
}

export function getA1CourseSnapshot(db, profileId, now = new Date()) {
  ensureA1CourseSchema(db);
  const topics = a1Topics(db);
  const topicStates = topics.map((topic) => publicState(ensureState(db, profileId, topic), topic, now));
  const byName = new Map(topicStates.map((state) => [state.name, state]));
  const units = A1_UNITS.map((unit, index) => {
    const unitTopics = unit.topics.map((name) => byName.get(name)).filter(Boolean);
    const previous = index ? A1_UNITS[index - 1].topics.map((name) => byName.get(name)).filter(Boolean) : [];
    return {
      ...unit,
      topics: unitTopics,
      unlocked: index === 0 || previous.every((state) => state.phase !== 'new' && state.masteryScore >= 35),
      percent: Math.round(unitTopics.reduce((sum, state) => sum + (state.phase === 'mastered' ? 100 : Math.min(95, state.masteryScore * 0.75)), 0) / Math.max(1, unitTopics.length)),
      familiarityPercent: Math.round(unitTopics.reduce((sum, state) => sum + state.masteryScore, 0) / Math.max(1, unitTopics.length)),
      masteredTopics: unitTopics.filter((state) => state.phase === 'mastered').length,
    };
  });
  const dueTopics = topicStates.filter((state) => state.due).sort((a, b) => a.lastQuality - b.lastQuality || a.masteryScore - b.masteryScore);
  const unlocked = new Set(units.filter((unit) => unit.unlocked).map((unit) => unit.id));
  const nextNewTopic = topicStates.find((state) => state.phase === 'new' && unlocked.has(unitFor(state.name)?.id)) || null;
  const vocabulary = vocabularyCoverage(db, profileId, now);
  const skills = skillCoverage(db, profileId);
  const familiarityPercent = Math.round(topicStates.reduce((sum, state) => sum + state.masteryScore, 0) / Math.max(1, topicStates.length));
  const topicPercent = Math.round(topicStates.reduce((sum, state) => sum + (state.phase === 'mastered' ? 100 : Math.min(95, state.masteryScore * 0.75)), 0) / Math.max(1, topicStates.length));
  const courseStartedAt = topicStates.map((state) => state.firstLearningAt).filter(Boolean).sort()[0] || null;
  const learningSpanDays = courseStartedAt ? Math.max(0, Math.floor((now.getTime() - new Date(courseStartedAt).getTime()) / DAY_MS)) : 0;
  const earliestPossibleCompletionAt = courseStartedAt ? addDays(courseStartedAt, MINIMUM_MASTERY_SPAN_DAYS) : null;
  const skillPercent = Math.round(skills.reduce((sum, skill) => sum + skill.percent, 0) / skills.length);
  const completionGates = {
    topics: topicStates.length > 0 && topicStates.every((state) => state.phase === 'mastered'),
    vocabulary: vocabulary.mature >= A1_CORE_VOCABULARY_TARGET,
    skills: skills.every((skill) => skill.complete),
    minimumSpan: learningSpanDays >= MINIMUM_MASTERY_SPAN_DAYS,
  };
  return {
    courseVersion: A1_COURSE_VERSION,
    level: 'A1',
    overallPercent: Math.round((topicPercent * 0.55) + (vocabulary.percent * 0.25) + (skillPercent * 0.20)),
    topicPercent,
    familiarityPercent,
    skillPercent,
    courseStartedAt,
    learningSpanDays,
    minimumCourseDays: MINIMUM_MASTERY_SPAN_DAYS,
    earliestPossibleCompletionAt,
    canGraduateByTime: completionGates.minimumSpan,
    masteredTopics: topicStates.filter((state) => state.phase === 'mastered').length,
    totalTopics: topicStates.length,
    dueCount: dueTopics.length,
    dueTopics,
    nextNewTopic,
    recommendedNewTopic: dueTopics.length <= 8 ? nextNewTopic : null,
    reviewBacklogHigh: dueTopics.length > 8,
    units,
    vocabulary,
    skills,
    completionGates,
    completed: Object.values(completionGates).every(Boolean),
    masteryRule: {
      minimumAttempts: 6,
      minimumSuccessfulDays: 4,
      minimumRetentionReviews: 4,
      minimumLearningSpanDays: MINIMUM_MASTERY_SPAN_DAYS,
      minimumStabilityDays: 14,
      minimumScore: 85,
      noteRu: 'Тема считается освоенной только после минимум 4 зачётных повторений в разные даты, не раньше чем через 14 дней после знакомства. Ранняя практика разрешена без ограничений, но не переносит обязательное повторение.',
    },
  };
}

function a1PracticeUrl(topicIds = []) {
  const params = new URLSearchParams({ tab: 'classic_quiz', mode: 'recommended' });
  const validIds = topicIds.map(Number).filter((topicId) => Number.isInteger(topicId) && topicId > 0);
  if (validIds.length > 0) params.set('topicIds', validIds.join(','));
  return `/exercises?${params.toString()}`;
}

export function getA1TodayPlan(db, profileId, now = new Date(), options = {}) {
  const course = getA1CourseSnapshot(db, profileId, now);
  const targetMinutes = clamp(Math.round(Number(options.targetMinutes) || 30), 10, 120);
  const weakestSkill = [...course.skills].sort((left, right) => left.percent - right.percent)[0];
  const candidates = [];

  if (course.dueCount) {
    candidates.push({
      kind: 'grammar_review', priority: 'required', titleRu: `Повторить ${Math.min(3, course.dueCount)} темы по расписанию`,
      descriptionRu: course.dueTopics.slice(0, 3).map((row) => row.name).join(' • '),
      rationaleRu: 'Срок повторения наступил: этот шаг лучше всего защищает материал от забывания.',
      topicIds: course.dueTopics.slice(0, 3).map((row) => row.topicId),
      actionUrl: a1PracticeUrl(course.dueTopics.slice(0, 3).map((row) => row.topicId)), minutes: 8,
    });
  }
  if (course.vocabulary.due > 0) {
    candidates.push({
      kind: 'vocabulary_review', priority: course.dueCount ? 'recommended' : 'required',
      titleRu: `Повторить слова по расписанию (${course.vocabulary.due})`,
      descriptionRu: 'Карточки, срок которых уже наступил.',
      rationaleRu: 'Короткое своевременное повторение полезнее длинной зубрёжки.', actionUrl: '/vocabulary', minutes: 6,
    });
  }
  if (course.nextNewTopic) {
    candidates.push({
      kind: 'new_topic', priority: course.reviewBacklogHigh ? 'optional' : 'recommended',
      titleRu: `Новая тема: ${course.nextNewTopic.name}`,
      descriptionRu: course.reviewBacklogHigh
        ? 'Можно идти вперёд, но сначала желательно сократить накопившиеся повторения.'
        : 'Следующий логичный шаг учебного плана: теория и контролируемая практика.',
      rationaleRu: course.reviewBacklogHigh ? 'Новый материал доступен без блокировки темпа.' : 'Предыдущая ступень уже достаточно знакома.',
      topicIds: [course.nextNewTopic.topicId],
      actionUrl: `/curriculum?tab=a1_units&topic=${course.nextNewTopic.topicId}`, minutes: 12,
    });
  }
  if (course.vocabulary.due === 0 && course.vocabulary.introduced < course.vocabulary.target) {
    candidates.push({
      kind: 'vocabulary_intro', priority: 'recommended', titleRu: 'Познакомиться с 8 новыми словами',
      descriptionRu: 'Небольшая порция лексики из доступных модулей, без попытки выучить все 650 сразу.',
      rationaleRu: 'Новые слова вводятся порциями, а затем возвращаются по интервальному расписанию.',
      actionUrl: '/vocabulary', minutes: 6,
    });
  }
  candidates.push({
    kind: 'skill', priority: 'recommended', titleRu: `Навык: ${weakestSkill?.skill || 'speaking'}`,
    descriptionRu: 'Короткая проверяемая задача в реальном контексте.',
    rationaleRu: 'Это сейчас самый слабый из четырёх обязательных навыков A1.',
    skill: weakestSkill?.skill || 'speaking', actionUrl: '/curriculum?tab=a1_skills', minutes: 8,
  });
  candidates.push({
    kind: 'story', priority: 'optional', titleRu: 'Испанский в сюжете',
    descriptionRu: 'Продолжить приключение и встретить знакомый материал в контексте.',
    rationaleRu: 'Контекст поддерживает интерес и перенос знаний в чтение.', actionUrl: '/stories', minutes: 10,
  });
  if (!candidates.some((action) => action.priority === 'required')) {
    if (candidates.length > 0) {
      candidates[0] = { ...candidates[0], priority: 'required' };
    } else {
      candidates.push({
        kind: 'practice', priority: 'required', titleRu: 'Короткая разминка',
        descriptionRu: 'Смешанная практика уже знакомого материала.',
        rationaleRu: 'Начинаем с извлечения из памяти.', actionUrl: a1PracticeUrl(), minutes: 5,
      });
    }
  }

  const actions = [];
  let plannedMinutes = 0;
  for (const action of candidates) {
    if (actions.length === 0 || plannedMinutes + action.minutes <= targetMinutes) {
      actions.push(action);
      plannedMinutes += action.minutes;
    }
  }
  const primaryAction = actions[0];
  const selectedKeys = new Set(actions.map((action) => `${action.kind}:${action.actionUrl}`));
  const continueOptions = candidates.filter((action) => !selectedKeys.has(`${action.kind}:${action.actionUrl}`));

  return {
    generatedAt: iso(now),
    targetMinutes,
    plannedMinutes,
    primaryAction,
    actions,
    continueOptions,
    pace: {
      presets: [15, 30, 60],
      unlimited: true,
      noteRu: 'Лимита занятий нет. План задаёт следующий лучший шаг, а после него можно продолжать сколько угодно.',
      certificationNoteRu: 'Пройти упражнения можно быстро, но статус «освоено» требует повторений в разные дни и минимум 14 дней удержания.',
    },
    course,
  };
}

export {
  A1_CORE_VOCABULARY,
  getA1VocabularyByDomain,
  getA1VocabularyByUnit,
  A1_CHECKPOINTS,
  getA1CheckpointByUnit,
  getAllA1Checkpoints,
  A1_SKILL_TASKS,
  getA1SkillTasks,
  getA1SkillTaskById
};
