const DAY_MS = 86_400_000;

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
    CREATE TABLE IF NOT EXISTS a1_topic_mastery (
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
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

  const vocabularyColumns = columns(db, 'vocabulary');
  if (!vocabularyColumns.has('cefr_level')) db.exec('ALTER TABLE vocabulary ADD COLUMN cefr_level TEXT');
  if (!vocabularyColumns.has('course_domain')) db.exec('ALTER TABLE vocabulary ADD COLUMN course_domain TEXT');
  if (!vocabularyColumns.has('course_unit_id')) db.exec('ALTER TABLE vocabulary ADD COLUMN course_unit_id TEXT');
  if (!vocabularyColumns.has('is_core_a1')) db.exec('ALTER TABLE vocabulary ADD COLUMN is_core_a1 INTEGER NOT NULL DEFAULT 0');
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
    db.prepare(`
      INSERT INTO a1_learning_attempts
        (profile_id, topic_id, event_id, correct, quality, activity_type, hints_used, response_ms, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(profileId, topicId, eventId, input.correct ? 1 : 0, quality, activityType, hintsUsed, responseMs, occurredAt);

    const recent = db.prepare(`
      SELECT correct FROM a1_learning_attempts
      WHERE profile_id = ? AND topic_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 12
    `).all(profileId, topicId);
    const successfulDays = Number(db.prepare(`
      SELECT COUNT(DISTINCT date(occurred_at)) AS count FROM a1_learning_attempts
      WHERE profile_id = ? AND topic_id = ? AND correct = 1 AND quality >= 3
    `).get(profileId, topicId).count);
    const repetitions = Number(previous.repetitions || 0) + 1;
    const lapses = Number(previous.lapses || 0) + (input.correct ? 0 : 1);
    const difficulty = clamp(Number(previous.difficulty || 5) + ((3 - quality) * 0.45), 1, 10);
    let stability;
    let phase;
    if (!input.correct || quality < 3) {
      stability = Math.max(0.25, Number(previous.stability_days || 0) * 0.35);
      phase = 'relearning';
    } else if (Number(previous.stability_days || 0) < 1) {
      stability = quality >= 5 ? 1.5 : 1;
      phase = 'learning';
    } else {
      const growth = clamp(1.65 + ((6 - difficulty) * 0.08) + ((quality - 3) * 0.18), 1.25, 2.25);
      stability = clamp(Number(previous.stability_days) * growth, 1, 60);
      phase = repetitions >= 3 ? 'review' : 'learning';
    }

    const accuracy = recent.reduce((sum, row) => sum + Number(row.correct), 0) / Math.max(1, recent.length);
    const masteryScore = clamp(Math.round(
      Math.min(25, repetitions * 4.2)
      + Math.min(30, successfulDays * 7.5)
      + Math.min(25, (stability / 14) * 25)
      + (accuracy * 20)
      - Math.min(20, lapses * 2)
    ), 0, 100);
    if (input.correct && quality >= 3 && repetitions >= 6 && successfulDays >= 4 && stability >= 14 && masteryScore >= 85) {
      phase = 'mastered';
    }
    const interval = (!input.correct || quality < 3) ? 0.25 : clamp(stability * (quality >= 5 ? 1.15 : 1), 1, 60);
    const nextReviewAt = addDays(now, phase === 'mastered' ? Math.max(30, interval) : interval);
    const masteredAt = phase === 'mastered' ? (previous.mastered_at || occurredAt) : null;

    db.prepare(`
      UPDATE a1_topic_mastery SET
        phase = ?, mastery_score = ?, stability_days = ?, difficulty = ?, repetitions = ?, lapses = ?,
        successful_days = ?, last_quality = ?, last_review_at = ?, next_review_at = ?, mastered_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE profile_id = ? AND topic_id = ?
    `).run(phase, masteryScore, stability, difficulty, repetitions, lapses, successfulDays, quality, occurredAt, nextReviewAt, masteredAt, profileId, topicId);

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
    return { replayed: false, quality, state: publicState(row, topic, now) };
  })();
}

function vocabularyCoverage(db, profileId) {
  const domains = db.prepare(`
    SELECT b.domain_id, b.title_ru, b.target_count, b.unit_id,
      COUNT(DISTINCT CASE WHEN v.is_core_a1 = 1 THEN v.id END) AS introduced,
      COUNT(DISTINCT CASE WHEN mature.vocabulary_id IS NOT NULL THEN v.id END) AS mature
    FROM a1_vocabulary_blueprint b
    LEFT JOIN vocabulary v ON v.profile_id = ? AND v.course_domain = b.domain_id
    LEFT JOIN (
      SELECT vocabulary_id FROM vocabulary_review_cards
      WHERE profile_id = ? AND state = 'review' AND interval_days >= 14 AND review_count >= 4
      GROUP BY vocabulary_id HAVING COUNT(DISTINCT direction) = 2
    ) mature ON mature.vocabulary_id = v.id
    GROUP BY b.domain_id, b.title_ru, b.target_count, b.unit_id
    ORDER BY b.rowid
  `).all(profileId, profileId).map((row) => ({
    id: row.domain_id, titleRu: row.title_ru, target: Number(row.target_count),
    introduced: Number(row.introduced), mature: Number(row.mature), unitId: row.unit_id,
    percent: Math.min(100, Math.round((Number(row.mature) / Number(row.target_count)) * 100)),
  }));
  const introduced = domains.reduce((sum, row) => sum + row.introduced, 0);
  const mature = domains.reduce((sum, row) => sum + row.mature, 0);
  return { target: A1_CORE_VOCABULARY_TARGET, introduced, mature, percent: Math.min(100, Math.round((mature / A1_CORE_VOCABULARY_TARGET) * 100)), domains };
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
      percent: Math.round(unitTopics.reduce((sum, state) => sum + state.masteryScore, 0) / Math.max(1, unitTopics.length)),
      masteredTopics: unitTopics.filter((state) => state.phase === 'mastered').length,
    };
  });
  const dueTopics = topicStates.filter((state) => state.due).sort((a, b) => a.lastQuality - b.lastQuality || a.masteryScore - b.masteryScore);
  const unlocked = new Set(units.filter((unit) => unit.unlocked).map((unit) => unit.id));
  const nextNewTopic = topicStates.find((state) => state.phase === 'new' && unlocked.has(unitFor(state.name)?.id)) || null;
  const vocabulary = vocabularyCoverage(db, profileId);
  const skills = skillCoverage(db, profileId);
  const topicPercent = Math.round(topicStates.reduce((sum, state) => sum + state.masteryScore, 0) / Math.max(1, topicStates.length));
  const skillPercent = Math.round(skills.reduce((sum, skill) => sum + skill.percent, 0) / skills.length);
  const completionGates = {
    topics: topicStates.length > 0 && topicStates.every((state) => state.phase === 'mastered'),
    vocabulary: vocabulary.mature >= A1_CORE_VOCABULARY_TARGET,
    skills: skills.every((skill) => skill.complete),
  };
  return {
    courseVersion: A1_COURSE_VERSION,
    level: 'A1',
    overallPercent: Math.round((topicPercent * 0.55) + (vocabulary.percent * 0.25) + (skillPercent * 0.20)),
    topicPercent,
    skillPercent,
    masteredTopics: topicStates.filter((state) => state.phase === 'mastered').length,
    totalTopics: topicStates.length,
    dueCount: dueTopics.length,
    dueTopics,
    nextNewTopic: dueTopics.length <= 8 ? nextNewTopic : null,
    reviewBacklogHigh: dueTopics.length > 8,
    units,
    vocabulary,
    skills,
    completionGates,
    completed: Object.values(completionGates).every(Boolean),
    masteryRule: {
      minimumAttempts: 6,
      minimumSuccessfulDays: 4,
      minimumStabilityDays: 14,
      minimumScore: 85,
      noteRu: 'Тема считается освоенной только после успешных повторений минимум в 4 разные даты и прогнозируемого удержания не менее 14 дней.',
    },
  };
}

export function getA1TodayPlan(db, profileId, now = new Date()) {
  const course = getA1CourseSnapshot(db, profileId, now);
  const weakestSkill = [...course.skills].sort((a, b) => a.percent - b.percent)[0];
  const actions = [];
  if (course.dueCount) {
    actions.push({
      kind: 'grammar_review', titleRu: `Повторить ${Math.min(3, course.dueCount)} темы по расписанию`,
      descriptionRu: course.dueTopics.slice(0, 3).map((row) => row.name).join(' • '),
      topicIds: course.dueTopics.slice(0, 3).map((row) => row.topicId), actionUrl: '/exercises', minutes: 8,
    });
  } else {
    actions.push({ kind: 'vocabulary_review', titleRu: 'Разминка: повторение слов', descriptionRu: 'Закрепи слова, срок которых наступил сегодня.', actionUrl: '/vocabulary', minutes: 5 });
  }
  if (course.nextNewTopic) {
    actions.push({ kind: 'new_topic', titleRu: `Новая тема: ${course.nextNewTopic.name}`, descriptionRu: 'Сначала теория и короткая контролируемая практика.', topicIds: [course.nextNewTopic.topicId], actionUrl: '/curriculum', minutes: 10 });
  } else {
    const weakest = [...course.units].filter((unit) => unit.unlocked).sort((a, b) => a.percent - b.percent)[0];
    actions.push({ kind: 'reinforcement', titleRu: 'Закрепить слабое место', descriptionRu: weakest ? `${weakest.titleRu}: ${weakest.outcomeRu}` : 'Смешанная практика A1', actionUrl: '/exercises', minutes: 8 });
  }
  actions.push({
    kind: 'skill', titleRu: `Навык дня: ${weakestSkill?.skill || 'speaking'}`,
    descriptionRu: 'Короткая задача в реальном контексте; результат пойдёт в навыковый зачёт A1.',
    skill: weakestSkill?.skill || 'speaking', actionUrl: weakestSkill?.skill === 'reading' ? '/stories' : '/chat', minutes: 7,
  });
  return { generatedAt: iso(now), actions, course };
}
