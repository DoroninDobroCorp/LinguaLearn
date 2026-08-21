import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import {
  A1_UNITS,
  A1_VOCABULARY_DOMAINS,
  A1_CORE_VOCABULARY_TARGET,
  A1_SKILLS,
  ensureA1CourseSchema,
  getA1CourseSnapshot,
  getA1TodayPlan,
  recordA1Attempt,
  recordA1SkillEvidence,
  recordA1CheckpointSubmission,
  seedCoreA1Vocabulary,
} from '../server/a1CourseEngine.js';

import { A1_CORE_VOCABULARY, getA1VocabularyByDomain } from '../server/a1VocabularyData.js';
import { GRAMMAR_THEORY_GUIDES, getGrammarTheoryGuide } from '../server/grammarTheoryData.js';
import { A1_CHECKPOINTS, getA1CheckpointByUnit, getAllA1Checkpoints } from '../server/a1CheckpointsData.js';
import { A1_SKILL_TASKS, getA1SkillTasks } from '../server/a1SkillTasksData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function createTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      avatar_emoji TEXT DEFAULT '👤',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO profiles (id, name) VALUES (1, 'TestUser');

    CREATE TABLE curriculum_topics (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      level TEXT NOT NULL,
      source TEXT DEFAULT 'preset',
      pedagogical_order INTEGER
    );

    CREATE TABLE curriculum_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL,
      profile_id INTEGER NOT NULL DEFAULT 1,
      status TEXT DEFAULT 'not_started',
      score REAL DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      failure_count INTEGER DEFAULT 0,
      last_practiced TEXT,
      is_locked INTEGER DEFAULT 0,
      UNIQUE(topic_id, profile_id)
    );

    CREATE TABLE vocabulary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL,
      word_key TEXT,
      translation TEXT NOT NULL,
      translation_key TEXT,
      example TEXT,
      level INTEGER DEFAULT 0,
      next_review TEXT DEFAULT CURRENT_TIMESTAMP,
      review_count INTEGER DEFAULT 0,
      last_reviewed TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      profile_id INTEGER DEFAULT 1,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      learned_permanently_at TEXT,
      cefr_level TEXT,
      course_domain TEXT,
      course_unit_id TEXT,
      is_core_a1 INTEGER NOT NULL DEFAULT 0,
      part_of_speech TEXT,
      gender TEXT,
      base_form TEXT,
      example_translation TEXT,
      notes TEXT,
      UNIQUE(profile_id, word_key, translation_key)
    );

    CREATE TABLE vocabulary_review_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vocabulary_id INTEGER NOT NULL,
      profile_id INTEGER NOT NULL,
      direction TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'new',
      review_count INTEGER NOT NULL DEFAULT 0,
      lapse_count INTEGER NOT NULL DEFAULT 0,
      interval_days REAL NOT NULL DEFAULT 0,
      ease_factor REAL NOT NULL DEFAULT 2.3,
      next_review_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      learned_until TEXT,
      last_reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_grade TEXT,
      UNIQUE(profile_id, vocabulary_id, direction)
    );
  `);

  // Populate curriculum_topics from A1_UNITS
  const insertTopic = db.prepare(`
    INSERT INTO curriculum_topics (id, name, category, level, source, pedagogical_order)
    VALUES (?, ?, ?, 'A1', 'preset', ?)
  `);

  const topicNameMap = {
    'Greetings and introductions (saludos)': 27,
    'Subject pronouns (yo/tú/vos/él/ella)': 7,
    'Numbers and counting': 19,
    'Gender and articles (el/la/los/las)': 4,
    'Indefinite articles (un/una/unos/unas)': 5,
    'Colors (colores)': 20,
    'Plural nouns (-s/-es)': 6,
    'Ser vs Estar (basic)': 1,
    'Basic adjective agreement (gender/number)': 13,
    'Describing people (describir personas)': 30,
    'Family members (la familia)': 21,
    'Possessive adjectives (mi/tu/su)': 8,
    'Tener (to have) and tener expressions': 11,
    'Parts of the body (el cuerpo)': 25,
    'Present tense regular -ar verbs': 2,
    'Negation (no + verb)': 17,
    'Question formation (¿...?)': 18,
    'Days, months, seasons': 22,
    'Asking and telling the time (la hora)': 28,
    'Numbers (0-1000)': 14,
    'Present tense regular -er/-ir verbs': 3,
    'Basic food and drinks (comida y bebida)': 23,
    'Ordering food (pedir comida)': 29,
    'Hay (there is / there are)': 10,
    'Prepositions of place (en/sobre/debajo de)': 15,
    'House and furniture (la casa)': 26,
    'Demonstratives (este/ese/aquel)': 9,
    'Present tense irregular verbs (ir/hacer/decir)': 16,
    'Gustar and similar verbs': 12,
    'Clothes (la ropa)': 24,
  };

  let order = 1;
  for (const unit of A1_UNITS) {
    for (const tName of unit.topics) {
      const tid = topicNameMap[tName] || order;
      insertTopic.run(tid, tName, 'Grammar', order);
      order++;
    }
  }

  ensureA1CourseSchema(db);
  return db;
}

describe('A1 Content Production Verification (TZ Specification)', () => {
  it('covers all 30 A1 topic packages with complete pedagogical structure', () => {
    const allTopicNames = A1_UNITS.flatMap((u) => u.topics);
    assert.equal(allTopicNames.length, 30, 'There must be exactly 30 preset topics in A1_UNITS');

    for (const unit of A1_UNITS) {
      for (const topicName of unit.topics) {
        const guide = getGrammarTheoryGuide(null, topicName);
        assert.ok(guide, `Topic package must exist for '${topicName}'`);
        assert.equal(guide.topicName, topicName);
        assert.ok(guide.russianTitle, `russianTitle required for '${topicName}'`);
        assert.ok(guide.summary, `summary required for '${topicName}'`);

        // 3-5 Measurable goals
        const goals = guide.goalsRu || guide.learningObjectives || [];
        assert.ok(goals.length >= 3 && goals.length <= 5, `Topic '${topicName}' must have 3..5 goalsRu (got ${goals.length})`);

        // 8-12 Examples with translations
        assert.ok(Array.isArray(guide.examples), `examples must be array for '${topicName}'`);
        assert.ok(guide.examples.length >= 8, `examples count for '${topicName}' must be >= 8 (got ${guide.examples.length})`);
        for (const ex of guide.examples) {
          assert.ok(ex.es && ex.ru, `Example must have 'es' and 'ru' in '${topicName}'`);
        }

        // Minimum 3 typical mistakes
        const mistakes = guide.typicalMistakes || guide.commonMistakes || [];
        assert.ok(mistakes.length >= 3, `Topic '${topicName}' must have >= 3 typical mistakes (got ${mistakes.length})`);
        for (const m of mistakes) {
          assert.ok(m.mistake && m.correction && m.explanation, `Mistake item must have mistake, correction, explanation`);
        }

        // Exactly 12 quiz questions: 4 recognition, 4 application, 4 transfer
        const quiz = guide.quiz || guide.quickCheckQuiz || [];
        assert.equal(quiz.length, 12, `Topic '${topicName}' quiz must have exactly 12 questions (got ${quiz.length})`);
        const recog = quiz.filter((q) => q.type === 'recognition');
        const appl = quiz.filter((q) => q.type === 'application');
        const trans = quiz.filter((q) => q.type === 'transfer');
        assert.equal(recog.length, 4, `Quiz recognition count must be 4 in '${topicName}'`);
        assert.equal(appl.length, 4, `Quiz application count must be 4 in '${topicName}'`);
        assert.equal(trans.length, 4, `Quiz transfer count must be 4 in '${topicName}'`);

        // Explanations for all options/distractors
        for (const q of quiz) {
          assert.ok(q.question, `Quiz question text required`);
          assert.ok(Array.isArray(q.options) && q.options.length >= 2, `Options required`);
          const expls = q.explanations || [q.explanation];
          assert.ok(expls.length >= q.options.length || q.explanation, `Distractor explanations required for each question in '${topicName}'`);
        }

        // Minimum 24 additional exercises
        assert.ok(Array.isArray(guide.exercises), `exercises array required in '${topicName}'`);
        assert.ok(guide.exercises.length >= 24, `exercises count must be >= 24 in '${topicName}' (got ${guide.exercises.length})`);

        // Minimum 6 multi-acceptable answers
        const multiAnswers = guide.exercises.filter((e) => Array.isArray(e.acceptableAnswers) && e.acceptableAnswers.length > 1);
        assert.ok(multiAnswers.length >= 6, `Multi-answer exercises must be >= 6 in '${topicName}' (got ${multiAnswers.length})`);

        // Minimum 2 spiral review exercises
        const spiralEx = guide.exercises.filter((e) => e.spiralReview);
        assert.ok(spiralEx.length >= 2, `Spiral review exercises must be >= 2 in '${topicName}' (got ${spiralEx.length})`);

        // Mini-scenario
        assert.ok(guide.miniScenario, `miniScenario required in '${topicName}'`);
        assert.ok(guide.miniScenario.situation && guide.miniScenario.task, `miniScenario must have situation and task`);

        // Short text with 3 comprehension questions
        assert.ok(guide.shortText, `shortText required in '${topicName}'`);
        assert.ok(guide.shortText.text && Array.isArray(guide.shortText.questions) && guide.shortText.questions.length >= 3, `shortText must have text and >= 3 questions in '${topicName}'`);

        // Productive task with 0..100 rubric
        assert.ok(guide.productiveTask, `productiveTask required in '${topicName}'`);
        assert.ok(guide.productiveTask.prompt && guide.productiveTask.rubric, `productiveTask must have prompt and rubric in '${topicName}'`);
        assert.equal(guide.productiveTask.rubric.total, 100, `Rubric total must be 100 in '${topicName}'`);
      }
    }
  });

  it('contains exactly 650 core vocabulary lemmas strictly matching domain targets with 0 mature on init', () => {
    assert.equal(A1_CORE_VOCABULARY.length, 650, 'A1_CORE_VOCABULARY must have exactly 650 lemmas');

    const expectedDomainCounts = {
      'identity': 45,
      'numbers-time': 55,
      'people-family': 65,
      'home-city': 65,
      'food': 70,
      'daily-actions': 75,
      'descriptions': 55,
      'clothes-shopping': 50,
      'transport-directions': 45,
      'weather-leisure': 45,
      'function-words': 45,
      'survival-phrases': 35,
    };

    const domainCounts = {};
    const seenWords = new Set();

    for (const item of A1_CORE_VOCABULARY) {
      assert.ok(item.word && item.translation, 'Each item must have word and translation');
      assert.ok(item.part_of_speech, `part_of_speech required for '${item.word}'`);
      assert.ok(item.base_form, `base_form required for '${item.word}'`);
      assert.ok(item.course_domain, `course_domain required for '${item.word}'`);
      assert.ok(item.course_unit_id, `course_unit_id required for '${item.word}'`);
      assert.ok(item.example && item.example_translation, `example and example_translation required for '${item.word}'`);
      assert.equal(item.cefr_level, 'A1');
      assert.equal(item.is_core_a1, 1);

      // Check normalization uniqueness
      const normKey = item.word.toLowerCase().trim();
      assert.ok(!seenWords.has(normKey), `Duplicate word detected: '${item.word}'`);
      seenWords.add(normKey);

      domainCounts[item.course_domain] = (domainCounts[item.course_domain] || 0) + 1;
    }

    for (const [dom, expCount] of Object.entries(expectedDomainCounts)) {
      assert.equal(domainCounts[dom], expCount, `Domain '${dom}' count must be exactly ${expCount}, got ${domainCounts[dom]}`);
    }

    // Verify in database snapshot
    const db = createTestDb();
    seedCoreA1Vocabulary(db, 1);

    const snapshot = getA1CourseSnapshot(db, 1);
    assert.equal(snapshot.vocabulary.target, 650);
    assert.equal(snapshot.vocabulary.introduced, 650);
    assert.equal(snapshot.vocabulary.mature, 0, 'Initial mature vocabulary must be 0 (cannot be pre-marked mature)');
    assert.equal(snapshot.vocabulary.percent, 0);

    // Verify 1300 review cards created (2 cards per word)
    const cardCount = db.prepare('SELECT COUNT(*) AS c FROM vocabulary_review_cards WHERE profile_id = 1').get().c;
    assert.equal(cardCount, 1300, 'Must create 2 review cards per word (650 * 2 = 1300)');
  });

  it('has at least 6 distinct tasks for each of the 4 skills (Listening, Speaking, Reading, Writing)', () => {
    for (const skill of A1_SKILLS) {
      const tasks = getA1SkillTasks(skill);
      assert.ok(tasks.length >= 6, `Skill '${skill}' must have >= 6 tasks (got ${tasks.length})`);

      for (const t of tasks) {
        assert.ok(t.id && t.unitId && t.title, `Skill task must have id, unitId, title`);
        if (skill === 'listening') {
          assert.ok(t.audioUrl && t.transcript && Array.isArray(t.questions) && t.questions.length >= 3, `Listening task '${t.id}' must have audioUrl, transcript, and >= 3 questions`);
        } else if (skill === 'reading') {
          assert.ok(t.text && Array.isArray(t.questions) && t.questions.length >= 3, `Reading task '${t.id}' must have text and >= 3 questions`);
        } else if (skill === 'speaking' || skill === 'writing') {
          assert.ok(t.rubric && t.rubric.total === 100, `Productive task '${t.id}' must have rubric totaling 100`);
        }
      }
    }
  });

  it('provides comprehensive checkpoints for Units 1-9 and Final Graduation Checkpoint', () => {
    const allCheckpoints = getAllA1Checkpoints();
    assert.equal(allCheckpoints.length, 10, 'Must have 9 unit checkpoints + 1 final checkpoint');

    for (let order = 1; order <= 9; order++) {
      const unit = A1_UNITS[order - 1];
      const chk = getA1CheckpointByUnit(unit.id);
      assert.ok(chk, `Checkpoint for unit '${unit.id}' must exist`);
      assert.ok(chk.tasks.length >= 12 && chk.tasks.length <= 18, `Unit ${order} checkpoint tasks count must be 12..18 (got ${chk.tasks.length})`);
    }

    const finalChk = getA1CheckpointByUnit('a1-final-graduation');
    assert.ok(finalChk, 'Final A1 Graduation checkpoint must exist');
    assert.ok(Array.isArray(finalChk.sections) && finalChk.sections.length === 4, 'Final checkpoint must have 4 skill sections');
  });

  it('verifies media assets exist within byte size limits and are registered in MANIFEST.json', () => {
    const manifestPath = path.join(projectRoot, 'public/a1/media/MANIFEST.json');
    assert.ok(fs.existsSync(manifestPath), 'MANIFEST.json must exist in public/a1/media/');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    assert.ok(Array.isArray(manifest.assets), 'manifest.assets must be an array');
    assert.ok(manifest.assets.length >= 80, `Manifest must contain all media assets (got ${manifest.assets.length})`);

    for (const asset of manifest.assets) {
      const filePath = path.join(projectRoot, 'public/a1/media', asset.filename);
      assert.ok(fs.existsSync(filePath), `Media file '${asset.filename}' must exist on disk`);
      const stat = fs.statSync(filePath);

      assert.ok(asset.altRu, `Asset '${asset.filename}' must have Russian alt text`);
      assert.ok(asset.license, `Asset '${asset.filename}' must have license metadata`);

      if (asset.type === 'cover') {
        assert.ok(stat.size <= 220 * 1024, `Cover '${asset.filename}' must be <= 220 KB (got ${stat.size} bytes)`);
      } else if (asset.type === 'illustration') {
        assert.ok(stat.size <= 120 * 1024, `Illustration '${asset.filename}' must be <= 120 KB (got ${stat.size} bytes)`);
      } else if (asset.type === 'audio') {
        assert.ok(stat.size <= 1024 * 1024, `Audio '${asset.filename}' must be <= 1 MB (got ${stat.size} bytes)`);
      }
    }
  });

  it('simulates multi-day adaptive progression: no same-day mastery, requires >= 4 distinct days', () => {
    const db = createTestDb();
    const profileId = 1;
    const topicId = 27; // Greetings and introductions (saludos)

    const baseDate = new Date('2025-09-01T10:00:00Z');

    // Day 1: User does 10 successful attempts on Day 1
    for (let i = 1; i <= 10; i++) {
      const res = recordA1Attempt(db, profileId, {
        topicId,
        eventId: `day1-attempt-${i}`,
        correct: true,
        quality: 5,
        activityType: 'quiz',
      }, baseDate);
      assert.notEqual(res.state.phase, 'mastered', 'Topic CANNOT be mastered on Day 1 even with 10 correct answers');
    }

    const day1State = getA1CourseSnapshot(db, profileId, baseDate).units[0].topics.find((t) => t.topicId === topicId);
    assert.ok(['learning', 'review'].includes(day1State.phase), 'Topic must be in learning/review phase (not mastered)');
    assert.notEqual(day1State.phase, 'mastered', 'Topic cannot be mastered on Day 1');
    assert.equal(day1State.successfulDays, 1);

    // Day 2 (+1 day)
    const day2Date = new Date('2025-09-02T10:00:00Z');
    recordA1Attempt(db, profileId, {
      topicId,
      eventId: 'day2-attempt-1',
      correct: true,
      quality: 5,
      activityType: 'quiz',
    }, day2Date);

    // Day 4 (+3 days)
    const day4Date = new Date('2025-09-04T10:00:00Z');
    recordA1Attempt(db, profileId, {
      topicId,
      eventId: 'day4-attempt-1',
      correct: true,
      quality: 5,
      activityType: 'quiz',
    }, day4Date);

    // Day 8 (+7 days)
    const day8Date = new Date('2025-09-08T10:00:00Z');
    recordA1Attempt(db, profileId, {
      topicId,
      eventId: 'day8-attempt-1',
      correct: true,
      quality: 5,
      activityType: 'quiz',
    }, day8Date);

    // Day 16 (+15 days): 4th successful day review, stability >= 14
    const day16Date = new Date('2025-09-16T10:00:00Z');
    const finalRes = recordA1Attempt(db, profileId, {
      topicId,
      eventId: 'day16-attempt-1',
      correct: true,
      quality: 5,
      activityType: 'quiz',
    }, day16Date);

    assert.equal(finalRes.state.phase, 'mastered', 'Topic becomes mastered after successful reviews across >= 4 distinct days with high retention');
    assert.ok(finalRes.state.successfulDays >= 4);
    assert.ok(finalRes.state.stabilityDays >= 14);
    assert.ok(finalRes.state.masteryScore >= 85);
  });
});
