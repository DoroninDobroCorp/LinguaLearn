import { MATEO_A1_STORY } from "./sandwichStoriesData.js";
import { getTodayRecommendations } from './recommendations.js';
import {
  ensureA1CourseSchema,
  getA1CourseSnapshot,
  getA1TodayPlan,
  recordA1Attempt,
  recordA1SkillEvidence,
  recordA1CheckpointSubmission,
  getA1CheckpointByUnit,
  getAllA1Checkpoints,
  getA1SkillTasks,
  getA1SkillTaskById,
  getA1VocabularyByDomain,
  getA1VocabularyByUnit,
  seedCoreA1Vocabulary,
} from './a1CourseEngine.js';
import { PRESET_STORIES } from './storiesData.js';
import { PRESET_SCENARIOS } from './scenariosData.js';
import { PRESET_WORD_TILES, PRESET_ERROR_DETECTIVES, SPEED_MATCH_PAIRS } from './gameExercises.js';
import {
  ensureGamificationSchema,
  getGamificationStatus,
  addProfileXp,
  updateDailyQuestProgress
} from './gamification.js';
import { getGrammarTheoryGuide, getAllA1TopicPackages } from './grammarTheoryData.js';
import { getFrequencyCatalogs, generateDecksForProfile } from './frequencyData.js';
import { ensureCurriculumExamsSchema, getExamsStatus, generateExamQuestions, submitExamResult } from './examEngine.js';
import { generateSpanishExercise } from './grammarExerciseEngine.js';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Database from 'better-sqlite3';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, isAbsolute, join, resolve } from 'path';
import { extractAllTags, extractFirstTag, stripTags } from '../lib/tagParser.js';
import {
  VocabularyApiError,
  createVocabularyEntry,
  deleteVocabularyEntry,
  ensureVocabularyReviewSchema,
  exportVocabularyArchive,
  getVocabularyStats,
  getLatestVocabularyStudySession,
  importVocabularyArchive,
  listDueReviewEntries,
  listLegacyDueVocabularyWords,
  listLegacyVocabularyWords,
  listDueReviewCards,
  listVocabularyEntries,
  markVocabularyEntryLearned,
  markVocabularyCardLearned,
  reviewLegacyVocabularyEntry,
  reviewVocabularyCard,
  setVocabularyFavorite,
  setVocabularyPermanentlyLearned,
  saveVocabularyStudySession,
  listVocabularyGroups,
  createVocabularyGroup,
  updateVocabularyGroup,
  deleteVocabularyGroup,
  addWordToGroup,
  removeWordFromGroup,
  setGroupWords,
  setWordGroups,
} from './vocabularyReview.js';
import { ensureCaseInsensitiveProfileNameIndex } from './profileNameMigration.js';
import {
  ACTIVE_PROFILE_TOKEN_HEADER,
  buildProfilePinSession,
  clearProfilePin,
  ensureActiveProfileSessionSchema,
  ensureProfilePinSchema,
  ensureProfilePinTokenSecret,
  getActiveProfileSession,
  isProfileLocked,
  ProfilePinError,
  PROFILE_UNLOCK_TOKEN_HEADER,
  rotateActiveProfileSession,
  sanitizeProfile,
  setProfilePin,
  verifyActiveProfileToken,
  verifyProfilePin,
  verifyProfilePinAccess,
  verifyProfileUnlockToken,
} from './profilePin.js';
import { buildProfileNameKey } from './unicodeKeys.js';
import { ensureVocabularyExactDuplicateIndex } from './vocabularyUniquenessMigration.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = Number.parseInt(process.env.PORT || '3003', 10);
const SERVICE_NAME = 'spanish-api';
const NODE_ENV = String(process.env.NODE_ENV || '').trim();
const ENV_PROFILE_PIN_TOKEN_SECRET = String(process.env.PROFILE_PIN_TOKEN_SECRET || '').trim();
const ENV_DB_PATH = String(process.env.SPANISH_DB_PATH || '').trim();
const ENV_ALLOWED_ORIGINS = String(process.env.SPANISH_ALLOWED_ORIGINS || '').trim();
const ENV_TRUST_PROXY = String(process.env.SPANISH_TRUST_PROXY || '').trim();
const DEFAULT_JSON_BODY_LIMIT = '100kb';
const VOCABULARY_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
const VOCABULARY_IMPORT_JSON_BODY_LIMIT = '2176kb';

const VALID_CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const DEFAULT_CEFR_LEVEL = 'A1';

// Инициализация Gemini
const geminiApiKey = String(process.env.GEMINI_API_KEY || '').trim();
const geminiEnabled = geminiApiKey.length > 0;
const genAI = geminiEnabled ? new GoogleGenerativeAI(geminiApiKey) : null;

if (!geminiEnabled) {
  console.warn(
    '⚠️ GEMINI_API_KEY not found. Core API will stay online, but AI chat endpoints will return 503 until Gemini is configured.'
  );
}

app.set('trust proxy', ENV_TRUST_PROXY || 'loopback, linklocal, uniquelocal');

// Инициализация базы данных
const DB_PATH = ENV_DB_PATH
  ? (isAbsolute(ENV_DB_PATH) ? ENV_DB_PATH : resolve(process.cwd(), ENV_DB_PATH))
  : join(__dirname, 'spanish_learning.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
ensureCurriculumExamsSchema(db);
ensureGamificationSchema(db);

// Создание таблиц
db.exec(`
  CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    level TEXT NOT NULL,
    score REAL DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    last_practiced TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    max_level TEXT DEFAULT 'C2',
    dark_mode INTEGER DEFAULT 0,
    notifications_enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vocabulary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    translation TEXT NOT NULL,
    example TEXT,
    level INTEGER DEFAULT 0,
    next_review TEXT DEFAULT CURRENT_TIMESTAMP,
    review_count INTEGER DEFAULT 0,
    last_reviewed TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT,
    earned_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS curriculum_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    level TEXT NOT NULL,
    status TEXT DEFAULT 'not_started',
    score REAL DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    last_practiced TEXT,
    source TEXT DEFAULT 'preset',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Индексы для производительности
  CREATE INDEX IF NOT EXISTS idx_vocabulary_next_review ON vocabulary(next_review);
  CREATE INDEX IF NOT EXISTS idx_topics_score ON topics(score);
  CREATE INDEX IF NOT EXISTS idx_topics_level ON topics(level);
  CREATE INDEX IF NOT EXISTS idx_chat_history_timestamp ON chat_history(timestamp);
  CREATE INDEX IF NOT EXISTS idx_curriculum_level ON curriculum_topics(level);
  CREATE INDEX IF NOT EXISTS idx_curriculum_status ON curriculum_topics(status);
`);

// Migrate: add source column if missing
try {
  db.prepare("SELECT source FROM curriculum_topics LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE curriculum_topics ADD COLUMN source TEXT DEFAULT 'preset'");
}

// ==================== HOUSEHOLD PROFILES MIGRATION ====================

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    avatar_emoji TEXT DEFAULT '👤',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

ensureProfilePinSchema(db);
ensureActiveProfileSessionSchema(db);
const PROFILE_PIN_TOKEN_SECRET = ensureProfilePinTokenSecret(db, ENV_PROFILE_PIN_TOKEN_SECRET);

// Ensure default profile exists
if (!db.prepare('SELECT id FROM profiles WHERE id = 1').get()) {
  db.exec("INSERT INTO profiles (id, name, avatar_emoji) VALUES (1, 'Default', '👤')");
}

// Prevent duplicate profile names (case-insensitive) while preserving existing profile data.
ensureCaseInsensitiveProfileNameIndex(db);

// Add profile_id to chat_history
try {
  db.prepare('SELECT profile_id FROM chat_history LIMIT 1').get();
} catch (e) {
  db.exec('ALTER TABLE chat_history ADD COLUMN profile_id INTEGER DEFAULT 1');
  db.exec('CREATE INDEX IF NOT EXISTS idx_chat_history_profile ON chat_history(profile_id)');
}

// Add profile_id to vocabulary
try {
  db.prepare('SELECT profile_id FROM vocabulary LIMIT 1').get();
} catch (e) {
  db.exec('ALTER TABLE vocabulary ADD COLUMN profile_id INTEGER DEFAULT 1');
  db.exec('CREATE INDEX IF NOT EXISTS idx_vocabulary_profile ON vocabulary(profile_id)');
}

// Per-profile curriculum progress (split from curriculum_topics)
db.exec(`
  CREATE TABLE IF NOT EXISTS curriculum_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE,
    profile_id INTEGER NOT NULL DEFAULT 1 REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'not_started',
    score REAL DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    last_practiced TEXT,
    UNIQUE(topic_id, profile_id)
  );
  CREATE INDEX IF NOT EXISTS idx_curriculum_progress_profile ON curriculum_progress(profile_id);
  CREATE INDEX IF NOT EXISTS idx_curriculum_progress_topic ON curriculum_progress(topic_id);
`);

// Migrate existing curriculum progress to default profile (one-time)
{
  const progressCount = db.prepare('SELECT COUNT(*) as c FROM curriculum_progress').get().c;
  if (progressCount === 0) {
    db.exec(`
      INSERT OR IGNORE INTO curriculum_progress
        (topic_id, profile_id, status, score, success_count, failure_count, last_practiced)
      SELECT id, 1, status, score, success_count, failure_count, last_practiced
      FROM curriculum_topics
      WHERE status != 'not_started'
    `);
  }
}

// Migrate user_settings to support multiple profiles (atomic transaction)
try {
  db.prepare('SELECT profile_id FROM user_settings LIMIT 1').get();
} catch (e) {
  const migrate = db.transaction(() => {
    const prev = db.prepare('SELECT * FROM user_settings WHERE id = 1').get();
    db.exec('DROP TABLE user_settings');
    db.exec(`
      CREATE TABLE user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
        max_level TEXT DEFAULT 'C2',
        dark_mode INTEGER DEFAULT 0,
        notifications_enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    if (prev) {
      db.prepare(
        'INSERT INTO user_settings (profile_id, max_level, dark_mode, notifications_enabled) VALUES (1, ?, ?, ?)'
      ).run(prev.max_level, prev.dark_mode, prev.notifications_enabled);
    }
  });
  migrate();
}

// Ensure default profile has settings
if (!db.prepare('SELECT id FROM user_settings WHERE profile_id = 1').get()) {
  db.prepare('INSERT INTO user_settings (profile_id, max_level) VALUES (1, ?)').run('B2');
}

// ==================== VOCABULARY UNIQUENESS MIGRATION ====================
// Preserve existing rows while tightening duplicate protection to exact
// word+translation matches inside each profile. Multiple senses for the same
// word can coexist; startup never deletes user vocabulary rows.
{
  const migration = ensureVocabularyExactDuplicateIndex(db);
  if (migration.exactDuplicates.length > 0) {
    console.warn(
      `⚠️ Skipped exact vocabulary unique index because ${migration.exactDuplicates.length} duplicate group(s) already exist.`
    );
  }
}

ensureVocabularyReviewSchema(db);

// ==================== CEFR CURRICULUM DATA ====================
const CURRICULUM_DATA = [
  // ===== A1 - Beginner =====
  // Grammar
  { name: 'Ser vs Estar (basic)', category: 'Grammar', level: 'A1' },
  { name: 'Present tense regular -ar verbs', category: 'Grammar', level: 'A1' },
  { name: 'Present tense regular -er/-ir verbs', category: 'Grammar', level: 'A1' },
  { name: 'Gender and articles (el/la/los/las)', category: 'Grammar', level: 'A1' },
  { name: 'Indefinite articles (un/una/unos/unas)', category: 'Grammar', level: 'A1' },
  { name: 'Plural nouns (-s/-es)', category: 'Grammar', level: 'A1' },
  { name: 'Subject pronouns (yo/tú/vos/él/ella)', category: 'Grammar', level: 'A1' },
  { name: 'Possessive adjectives (mi/tu/su)', category: 'Grammar', level: 'A1' },
  { name: 'Demonstratives (este/ese/aquel)', category: 'Grammar', level: 'A1' },
  { name: 'Hay (there is / there are)', category: 'Grammar', level: 'A1' },
  { name: 'Tener (to have) and tener expressions', category: 'Grammar', level: 'A1' },
  { name: 'Gustar and similar verbs', category: 'Grammar', level: 'A1' },
  { name: 'Basic adjective agreement (gender/number)', category: 'Grammar', level: 'A1' },
  { name: 'Numbers (0-1000)', category: 'Grammar', level: 'A1' },
  { name: 'Prepositions of place (en/sobre/debajo de)', category: 'Grammar', level: 'A1' },
  { name: 'Present tense irregular verbs (ir/hacer/decir)', category: 'Grammar', level: 'A1' },
  { name: 'Negation (no + verb)', category: 'Grammar', level: 'A1' },
  { name: 'Question formation (¿...?)', category: 'Grammar', level: 'A1' },
  // Vocabulary themes
  { name: 'Numbers and counting', category: 'Vocabulary', level: 'A1' },
  { name: 'Colors (colores)', category: 'Vocabulary', level: 'A1' },
  { name: 'Family members (la familia)', category: 'Vocabulary', level: 'A1' },
  { name: 'Days, months, seasons', category: 'Vocabulary', level: 'A1' },
  { name: 'Basic food and drinks (comida y bebida)', category: 'Vocabulary', level: 'A1' },
  { name: 'Clothes (la ropa)', category: 'Vocabulary', level: 'A1' },
  { name: 'Parts of the body (el cuerpo)', category: 'Vocabulary', level: 'A1' },
  { name: 'House and furniture (la casa)', category: 'Vocabulary', level: 'A1' },
  // Functions
  { name: 'Greetings and introductions (saludos)', category: 'Speaking', level: 'A1' },
  { name: 'Asking and telling the time (la hora)', category: 'Speaking', level: 'A1' },
  { name: 'Ordering food (pedir comida)', category: 'Speaking', level: 'A1' },
  { name: 'Describing people (describir personas)', category: 'Speaking', level: 'A1' },

  // ===== A2 - Elementary =====
  { name: 'Dialects: Spain vs Latin America (vosotros vs ustedes, vocabulary)', category: 'Speaking', level: 'A2' },

  { name: 'Perífrasis de infinitivo (empezar a / terminar de / volver a / ir a)', category: 'Grammar', level: 'A2' },

  // Grammar
  { name: 'Preterite tense (regular verbs)', category: 'Grammar', level: 'A2' },
  { name: 'Preterite tense (irregular verbs)', category: 'Grammar', level: 'A2' },
  { name: 'Imperfect tense (regular & irregular)', category: 'Grammar', level: 'A2' },
  { name: 'Ir a + infinitive (future)', category: 'Grammar', level: 'A2' },
  { name: 'Reflexive verbs (verbos reflexivos)', category: 'Grammar', level: 'A2' },
  { name: 'Direct object pronouns (me/te/lo/la/nos/los/las)', category: 'Grammar', level: 'A2' },
  { name: 'Indirect object pronouns (me/te/le/nos/les)', category: 'Grammar', level: 'A2' },
  { name: 'Comparative adjectives (más/menos... que)', category: 'Grammar', level: 'A2' },
  { name: 'Superlative adjectives (el más/el menos)', category: 'Grammar', level: 'A2' },
  { name: 'Adverbs of frequency (siempre/nunca/a veces)', category: 'Grammar', level: 'A2' },
  { name: 'Por vs Para (basic)', category: 'Grammar', level: 'A2' },
  { name: 'Tener que + infinitive (obligation)', category: 'Grammar', level: 'A2' },
  { name: 'Deber + infinitive (should)', category: 'Grammar', level: 'A2' },
  { name: 'Possessive pronouns (mío/tuyo/suyo)', category: 'Grammar', level: 'A2' },
  { name: 'Estar + gerund (present progressive)', category: 'Grammar', level: 'A2' },
  { name: 'Conjunctions (y/pero/o/porque)', category: 'Grammar', level: 'A2' },
  { name: 'Question words (quién/qué/dónde/cuándo/por qué/cómo)', category: 'Grammar', level: 'A2' },
  { name: 'Acabar de + infinitive (just did)', category: 'Grammar', level: 'A2' },
  // Vocabulary themes
  { name: 'Travel and transport (viajes y transporte)', category: 'Vocabulary', level: 'A2' },
  { name: 'Weather (el tiempo)', category: 'Vocabulary', level: 'A2' },
  { name: 'Hobbies and leisure (pasatiempos)', category: 'Vocabulary', level: 'A2' },
  { name: 'Jobs and occupations (profesiones)', category: 'Vocabulary', level: 'A2' },
  { name: 'Shopping (ir de compras)', category: 'Vocabulary', level: 'A2' },
  { name: 'Health and the body (la salud)', category: 'Vocabulary', level: 'A2' },
  { name: 'Daily routines (rutina diaria)', category: 'Vocabulary', level: 'A2' },
  // Functions
  { name: 'Asking for and giving directions (pedir direcciones)', category: 'Speaking', level: 'A2' },
  { name: 'Making suggestions (¿Vamos a...? / ¿Qué tal si...?)', category: 'Speaking', level: 'A2' },
  { name: 'Describing past events (contar experiencias)', category: 'Speaking', level: 'A2' },
  { name: 'Making plans and arrangements (hacer planes)', category: 'Speaking', level: 'A2' },
  { name: 'Expressing likes and dislikes (gustos y preferencias)', category: 'Speaking', level: 'A2' },

  // ===== B1 - Intermediate =====
  { name: 'Regional variations: Voseo and Rioplatense / Central American Spanish', category: 'Speaking', level: 'B1' },

  { name: 'Perífrasis modales (dejar de / ponerse a / haber que + infinitivo)', category: 'Grammar', level: 'B1' },

  { name: 'Perífrasis de gerundio (seguir / continuar + gerundio, llevar + tiempo)', category: 'Grammar', level: 'B1' },

  // Grammar
  { name: 'Present subjunctive (regular verbs)', category: 'Grammar', level: 'B1' },
  { name: 'Subjunctive with wishes and emotions (quiero que/espero que)', category: 'Grammar', level: 'B1' },
  { name: 'Subjunctive with doubt and denial (dudo que/no creo que)', category: 'Grammar', level: 'B1' },
  { name: 'Present perfect (pretérito perfecto)', category: 'Grammar', level: 'B1' },
  { name: 'Preterite vs Imperfect contrast', category: 'Grammar', level: 'B1' },
  { name: 'Conditional tense (regular & irregular)', category: 'Grammar', level: 'B1' },
  { name: 'Future tense (regular & irregular)', category: 'Grammar', level: 'B1' },
  { name: 'Relative clauses (que/quien/donde/el cual)', category: 'Grammar', level: 'B1' },
  { name: 'Indirect speech (estilo indirecto)', category: 'Grammar', level: 'B1' },
  { name: 'Imperative mood (affirmative & negative)', category: 'Grammar', level: 'B1' },
  { name: 'Double object pronouns (se lo/se la)', category: 'Grammar', level: 'B1' },
  { name: 'Ser vs Estar (advanced uses)', category: 'Grammar', level: 'B1' },
  { name: 'Subjunctive vs Indicative (basic contrast)', category: 'Grammar', level: 'B1' },
  { name: 'Impersonal se (se habla, se dice)', category: 'Grammar', level: 'B1' },
  { name: 'Pluperfect (pretérito pluscuamperfecto)', category: 'Grammar', level: 'B1' },
  { name: 'Linking words (sin embargo/aunque/a pesar de)', category: 'Grammar', level: 'B1' },
  { name: 'Verbs with prepositions (pensar en, soñar con)', category: 'Grammar', level: 'B1' },
  { name: 'Indefinite pronouns (algo/nada/alguien/nadie)', category: 'Grammar', level: 'B1' },
  // Vocabulary themes
  { name: 'Education and studying (educación)', category: 'Vocabulary', level: 'B1' },
  { name: 'Technology and the internet (tecnología)', category: 'Vocabulary', level: 'B1' },
  { name: 'Environment and nature (medio ambiente)', category: 'Vocabulary', level: 'B1' },
  { name: 'Feelings and emotions (sentimientos)', category: 'Vocabulary', level: 'B1' },
  { name: 'Crime and law (crimen y justicia)', category: 'Vocabulary', level: 'B1' },
  { name: 'Money and finance (dinero y finanzas)', category: 'Vocabulary', level: 'B1' },
  // Functions
  { name: 'Expressing opinions (creo que/en mi opinión)', category: 'Speaking', level: 'B1' },
  { name: 'Agreeing and disagreeing (estar de acuerdo)', category: 'Speaking', level: 'B1' },
  { name: 'Making complaints (hacer una queja)', category: 'Speaking', level: 'B1' },
  { name: 'Telling a story / anecdote (contar una historia)', category: 'Speaking', level: 'B1' },
  { name: 'Giving advice (dar consejos)', category: 'Speaking', level: 'B1' },

  // ===== B2 - Upper-Intermediate =====
  // Grammar
  { name: 'Imperfect subjunctive (pretérito imperfecto de subjuntivo)', category: 'Grammar', level: 'B2' },
  { name: 'Si clauses (real and unreal conditions)', category: 'Grammar', level: 'B2' },
  { name: 'Ojalá + subjunctive', category: 'Grammar', level: 'B2' },
  { name: 'Passive voice (ser + participio / pasiva refleja)', category: 'Grammar', level: 'B2' },
  { name: 'Past perfect subjunctive (pluscuamperfecto de subjuntivo)', category: 'Grammar', level: 'B2' },
  { name: 'Future perfect (futuro perfecto)', category: 'Grammar', level: 'B2' },
  { name: 'Conditional perfect (condicional compuesto)', category: 'Grammar', level: 'B2' },
  { name: 'Reported speech advanced (estilo indirecto avanzado)', category: 'Grammar', level: 'B2' },
  { name: 'Relative clauses with prepositions (en el que/del cual)', category: 'Grammar', level: 'B2' },
  { name: 'Por vs Para (advanced)', category: 'Grammar', level: 'B2' },
  { name: 'Subjunctive in adjective clauses (busco alguien que...)', category: 'Grammar', level: 'B2' },
  { name: 'Subjunctive in adverbial clauses (antes de que/para que)', category: 'Grammar', level: 'B2' },
  { name: 'Subjunctive vs Indicative in dependent clauses', category: 'Grammar', level: 'B2' },
  { name: 'Nominalisation (lo + adjective / lo que)', category: 'Grammar', level: 'B2' },
  { name: 'Absolute constructions (participio absoluto)', category: 'Grammar', level: 'B2' },
  { name: 'Emphasis and focus structures (lo que... es)', category: 'Grammar', level: 'B2' },
  // Vocabulary themes
  { name: 'Work and career (trabajo y carrera)', category: 'Vocabulary', level: 'B2' },
  { name: 'Media and news (medios de comunicación)', category: 'Vocabulary', level: 'B2' },
  { name: 'Relationships and society (relaciones y sociedad)', category: 'Vocabulary', level: 'B2' },
  { name: 'Science and research (ciencia e investigación)', category: 'Vocabulary', level: 'B2' },
  { name: 'Common expressions and set phrases (expresiones hechas)', category: 'Vocabulary', level: 'B2' },
  { name: 'Collocations (dar/hacer/tener/poner)', category: 'Vocabulary', level: 'B2' },
  { name: 'Idioms (modismos comunes)', category: 'Vocabulary', level: 'B2' },
  // Functions
  { name: 'Debating and persuading (debatir y persuadir)', category: 'Speaking', level: 'B2' },
  { name: 'Speculating about the future (especular)', category: 'Speaking', level: 'B2' },
  { name: 'Describing trends and data (describir tendencias)', category: 'Speaking', level: 'B2' },
  { name: 'Formal vs informal register (registro formal/informal)', category: 'Speaking', level: 'B2' },
  { name: 'Expressing hypothetical situations (situaciones hipotéticas)', category: 'Speaking', level: 'B2' },

  // ===== C1 - Advanced =====
  // Grammar
  { name: 'Advanced subjunctive uses (subjuntivo avanzado)', category: 'Grammar', level: 'C1' },
  { name: 'Pluperfect subjunctive in si clauses', category: 'Grammar', level: 'C1' },
  { name: 'Mixed conditional sentences', category: 'Grammar', level: 'C1' },
  { name: 'Complex clause structures (oraciones subordinadas complejas)', category: 'Grammar', level: 'C1' },
  { name: 'Perifrasis verbales (ir + gerundio, llevar + gerundio)', category: 'Grammar', level: 'C1' },
  { name: 'Advanced passive and impersonal constructions', category: 'Grammar', level: 'C1' },
  { name: 'Discourse markers (en realidad/de hecho/por cierto)', category: 'Grammar', level: 'C1' },
  { name: 'Advanced relative clauses (cuyo/lo cual)', category: 'Grammar', level: 'C1' },
  { name: 'Concessive clauses (por más que/por mucho que)', category: 'Grammar', level: 'C1' },
  { name: 'Hedging and nuanced expression (matizar)', category: 'Grammar', level: 'C1' },
  // Vocabulary themes
  { name: 'Abstract concepts (conceptos abstractos)', category: 'Vocabulary', level: 'C1' },
  { name: 'Academic vocabulary (vocabulario académico)', category: 'Vocabulary', level: 'C1' },
  { name: 'Advanced verb collocations', category: 'Vocabulary', level: 'C1' },
  { name: 'Formal and informal registers (registros)', category: 'Vocabulary', level: 'C1' },
  { name: 'Word formation (prefixes/suffixes: des-/in-/-ción/-miento)', category: 'Vocabulary', level: 'C1' },
  { name: 'Business Spanish (español de negocios)', category: 'Vocabulary', level: 'C1' },
  // Functions
  { name: 'Nuanced opinion expression (expresión matizada)', category: 'Speaking', level: 'C1' },
  { name: 'Academic presentations (presentaciones académicas)', category: 'Speaking', level: 'C1' },
  { name: 'Negotiation language (lenguaje de negociación)', category: 'Speaking', level: 'C1' },
  { name: 'Expressing irony and sarcasm (ironía y sarcasmo)', category: 'Speaking', level: 'C1' },

  // ===== C2 - Mastery =====
  // Grammar
  { name: 'Literary tenses (pretérito anterior, futuro de subjuntivo)', category: 'Grammar', level: 'C2' },
  { name: 'Stylistic and rhetorical structures', category: 'Grammar', level: 'C2' },
  { name: 'Archaic and literary grammar (gramática literaria)', category: 'Grammar', level: 'C2' },
  { name: 'Complex sentence patterns (patrones oracionales complejos)', category: 'Grammar', level: 'C2' },
  { name: 'Pragmatics and implicature (pragmática)', category: 'Grammar', level: 'C2' },
  // Vocabulary themes
  { name: 'Refranes y proverbios (proverbs and sayings)', category: 'Vocabulary', level: 'C2' },
  { name: 'Specialized terminology (terminología especializada)', category: 'Vocabulary', level: 'C2' },
  { name: 'Literary and poetic vocabulary (vocabulario literario)', category: 'Vocabulary', level: 'C2' },
  { name: 'Slang and colloquialisms (argot y coloquialismos)', category: 'Vocabulary', level: 'C2' },
  { name: 'Dialectal variation (variación dialectal)', category: 'Vocabulary', level: 'C2' },
  // Functions
  { name: 'Rhetorical devices (recursos retóricos)', category: 'Speaking', level: 'C2' },
  { name: 'Humor and wordplay (humor y juegos de palabras)', category: 'Speaking', level: 'C2' },
  { name: 'Persuasive essay writing (ensayo persuasivo)', category: 'Speaking', level: 'C2' },
];

// Seed curriculum topics
const insertCurriculum = db.prepare(
  'INSERT OR IGNORE INTO curriculum_topics (name, category, level) VALUES (?, ?, ?)'
);
const seedCurriculum = db.transaction(() => {
  for (const topic of CURRICULUM_DATA) {
    insertCurriculum.run(topic.name, topic.category, topic.level);
  }
});
seedCurriculum();
ensureA1CourseSchema(db);

const DEFAULT_DEV_TRUSTED_APP_ORIGINS = NODE_ENV === 'production'
  ? []
  : [
      'http://localhost:5175',
      'http://127.0.0.1:5175',
    ];

function normalizeTrustedOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

const TRUSTED_APP_ORIGINS = new Set(
  [...DEFAULT_DEV_TRUSTED_APP_ORIGINS, ...ENV_ALLOWED_ORIGINS.split(',')]
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeTrustedOrigin)
    .filter(Boolean),
);

function getRequestOrigin(req) {
  const candidates = [req.get('origin'), req.get('referer')];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      return new URL(candidate).origin;
    } catch {
      // Ignore malformed origins and keep checking.
    }
  }

  return '';
}

function getSameOriginBase(req) {
  const forwardedHost = req.get('x-forwarded-host');
  const host = req.app.get('trust proxy fn')?.(req.socket.remoteAddress, 0)
    ? (forwardedHost?.split(',')[0].trim() || req.get('host'))
    : req.get('host');
  if (!host) {
    return '';
  }

  return `${req.protocol}://${host}`;
}

function isTrustedAppOrigin(req) {
  const requestOrigin = getRequestOrigin(req);
  if (!requestOrigin) {
    return false;
  }

  return TRUSTED_APP_ORIGINS.has(requestOrigin) || requestOrigin === getSameOriginBase(req);
}

function getTrustedAppOrigin(req) {
  return isTrustedAppOrigin(req) ? getRequestOrigin(req) : '';
}

function requireTrustedProfileManagementOrigin(req, res, next) {
  if (isTrustedAppOrigin(req)) {
    return next();
  }

  return res.status(403).json({
    error: 'Profile management requests must come from the Spanish app.',
    code: 'UNTRUSTED_ORIGIN',
  });
}

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, false);
      return;
    }

    const normalizedOrigin = normalizeTrustedOrigin(origin);
    callback(null, Boolean(normalizedOrigin) && TRUSTED_APP_ORIGINS.has(normalizedOrigin));
  },
}));

const defaultJsonParser = express.json({ limit: DEFAULT_JSON_BODY_LIMIT });
const vocabularyImportJsonParser = express.json({
  limit: VOCABULARY_IMPORT_JSON_BODY_LIMIT,
  verify(req, res, buffer) {
    req.vocabularyImportBodyBytes = buffer.length;
  },
});
const vocabularyStudySessionJsonParser = express.json({ limit: '2mb' });

app.use((req, res, next) => {
  if (req.path === '/api/vocabulary/import') {
    return vocabularyImportJsonParser(req, res, next);
  }
  if (req.path === '/api/vocabulary/study-session' && req.method === 'PUT') {
    return vocabularyStudySessionJsonParser(req, res, next);
  }

  return defaultJsonParser(req, res, next);
});

app.use((error, req, res, next) => {
  if (req.path === '/api/vocabulary/import' && error?.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Vocabulary import file is too large. Exports up to 2 MB are supported.',
      code: 'VOCABULARY_IMPORT_TOO_LARGE',
    });
  }
  if (req.path === '/api/vocabulary/study-session' && error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Vocabulary study session is too large.', code: 'STUDY_STATE_TOO_LARGE' });
  }

  return next(error);
});

const PROFILE_NAME_MAX_LENGTH = 30;
const ALLOWED_AVATARS = new Set(['👤', '👩', '👨', '👧', '👦', '🧑', '👵', '👴', '🐱', '🐶', '🦊', '🌟']);

// Profile management routes are mounted before the profile-selection middleware
// because they must remain reachable even when the default profile is locked.
const profileManagementRouter = express.Router();

profileManagementRouter.get('/profiles', (req, res) => {
  try {
    const profiles = db.prepare('SELECT * FROM profiles ORDER BY id').all().map(sanitizeProfile);
    res.json({ profiles });
  } catch (error) {
    console.error('Error fetching profiles:', error);
    res.status(500).json({ error: error.message });
  }
});

profileManagementRouter.post('/profiles', requireTrustedProfileManagementOrigin, (req, res) => {
  try {
    const { name, avatarEmoji } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Profile name is required' });
    }

    const trimmedName = name.trim();

    if (trimmedName.length > PROFILE_NAME_MAX_LENGTH) {
      return res.status(400).json({ error: `Profile name must be ${PROFILE_NAME_MAX_LENGTH} characters or fewer` });
    }

    const avatarToUse = (avatarEmoji && ALLOWED_AVATARS.has(avatarEmoji)) ? avatarEmoji : '👤';
    const profileNameKey = buildProfileNameKey(trimmedName);

    const existing = db.prepare('SELECT id FROM profiles WHERE name_key = ?').get(profileNameKey);
    if (existing) {
      return res.status(409).json({ error: 'A profile with this name already exists' });
    }

    const createProfileWithSettings = db.transaction((pName, pNameKey, pAvatar) => {
      const result = db.prepare(
        'INSERT INTO profiles (name, name_key, avatar_emoji) VALUES (?, ?, ?)'
      ).run(pName, pNameKey, pAvatar);
      const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(result.lastInsertRowid);
      db.prepare('INSERT INTO user_settings (profile_id, max_level) VALUES (?, ?)').run(profile.id, 'B2');
      return profile;
    });

    const profile = createProfileWithSettings(trimmedName, profileNameKey, avatarToUse);
    res.json(sanitizeProfile(profile));
  } catch (error) {
    console.error('Error creating profile:', error);
    res.status(500).json({ error: error.message });
  }
});

profileManagementRouter.post('/profiles/:id/select', requireTrustedProfileManagementOrigin, (req, res) => {
  try {
    const now = new Date();
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      throw new ProfilePinError(400, 'Profile id must be a positive integer', 'INVALID_PROFILE_ID');
    }

    const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
    if (!profile) {
      throw new ProfilePinError(404, 'Profile not found', 'PROFILE_NOT_FOUND');
    }

    if (isProfileLocked(profile)) {
      const unlockToken = req.get(PROFILE_UNLOCK_TOKEN_HEADER);
      if (!verifyProfileUnlockToken(profile, unlockToken, PROFILE_PIN_TOKEN_SECRET)) {
        throw new ProfilePinError(423, 'Profile is locked. Enter the PIN to continue.', 'PROFILE_LOCKED');
      }
    }

    res.json(buildProfileManagementSession(profile, req, {
      now,
      rotateActiveSelection: true,
    }));
  } catch (error) {
    handleVocabularyError(res, error, 'Error selecting profile:');
  }
});

profileManagementRouter.post('/profiles/:id/unlock', requireTrustedProfileManagementOrigin, (req, res) => {
  try {
    const now = new Date();
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      throw new ProfilePinError(400, 'Profile id must be a positive integer', 'INVALID_PROFILE_ID');
    }

    const profile = verifyProfilePinAccess(db, id, req.body?.pin, now);

    res.json({
      success: true,
      ...buildProfileManagementSession(profile, req, {
        now,
        rotateActiveSelection: true,
      }),
    });
  } catch (error) {
    handleVocabularyError(res, error, 'Error unlocking profile:');
  }
});

profileManagementRouter.post('/profiles/:id/pin', requireTrustedProfileManagementOrigin, (req, res) => {
  try {
    const now = new Date();
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      throw new ProfilePinError(400, 'Profile id must be a positive integer', 'INVALID_PROFILE_ID');
    }

    const existingProfile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
    if (!existingProfile) {
      throw new ProfilePinError(404, 'Profile not found', 'PROFILE_NOT_FOUND');
    }

    assertCanInitializeUnlockedProfilePin(req, existingProfile);

    if (isProfileLocked(existingProfile)) {
      verifyProfilePinAccess(db, id, req.body?.currentPin, now);
    }

    const profile = setProfilePin(db, id, req.body?.newPin, req.body?.currentPin, now, {
      skipCurrentPinVerification: isProfileLocked(existingProfile),
    });
    res.json(buildProfileManagementSession(profile, req, {
      now,
      rotateActiveSelection: shouldRefreshCurrentActiveProfileSession(req, id),
    }));
  } catch (error) {
    handleVocabularyError(res, error, 'Error setting profile PIN:');
  }
});

profileManagementRouter.delete('/profiles/:id/pin', requireTrustedProfileManagementOrigin, (req, res) => {
  try {
    const now = new Date();
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      throw new ProfilePinError(400, 'Profile id must be a positive integer', 'INVALID_PROFILE_ID');
    }

    verifyProfilePinAccess(db, id, req.body?.currentPin, now);

    const profile = clearProfilePin(db, id, req.body?.currentPin, {
      skipCurrentPinVerification: true,
    });
    res.json(buildProfileManagementSession(profile, req, {
      now,
      rotateActiveSelection: shouldRefreshCurrentActiveProfileSession(req, id),
    }));
  } catch (error) {
    handleVocabularyError(res, error, 'Error clearing profile PIN:');
  }
});

profileManagementRouter.delete('/profiles/:id', requireTrustedProfileManagementOrigin, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (id === 1) {
      return res.status(400).json({ error: 'Cannot delete the default profile' });
    }

    const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    if (isProfileLocked(profile)) {
      verifyProfilePinAccess(db, id, req.body?.pin, new Date());
    }

    const deleteProfile = db.transaction((profileId) => {
      db.prepare('DELETE FROM chat_history WHERE profile_id = ?').run(profileId);
      db.prepare('DELETE FROM vocabulary WHERE profile_id = ?').run(profileId);
      db.prepare('DELETE FROM curriculum_progress WHERE profile_id = ?').run(profileId);
      db.prepare('DELETE FROM user_settings WHERE profile_id = ?').run(profileId);
      db.prepare(`
        DELETE FROM curriculum_topics
        WHERE source = 'ai_detected'
          AND id NOT IN (SELECT DISTINCT topic_id FROM curriculum_progress)
      `).run();
      db.prepare('DELETE FROM profiles WHERE id = ?').run(profileId);
    });
    deleteProfile(id);

    res.json({ success: true });
  } catch (error) {
    handleVocabularyError(res, error, 'Error deleting profile:');
  }
});

app.use('/api', profileManagementRouter);

// ==================== PROFILE VALIDATION MIDDLEWARE ====================
// When profileId is absent → backward-compatible default (profile 1).
// When profileId is explicitly provided but invalid/non-existent → 400/404
// so a stale client never silently writes into another user's data.

function parseRequestedProfileId(rawProfileId) {
  if (rawProfileId === undefined || rawProfileId === null || rawProfileId === '') {
    return null;
  }

  const id = parseInt(rawProfileId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw new ProfilePinError(400, 'Invalid profileId', 'INVALID_PROFILE_ID');
  }

  return id;
}

function buildProfileManagementSession(profile, req, {
  now = new Date(),
  rotateActiveSelection = false,
} = {}) {
  const trustedOrigin = getTrustedAppOrigin(req);
  const activeSession = rotateActiveSelection
    ? rotateActiveProfileSession(db, profile.id, trustedOrigin, now)
    : null;

  const session = buildProfilePinSession(profile, PROFILE_PIN_TOKEN_SECRET, {
    now,
    trustedOrigin,
    sessionNonce: activeSession?.session_nonce ?? '',
  });

  if (!activeSession) {
    return {
      ...session,
      activeProfileToken: null,
    };
  }

  return session;
}

function shouldRefreshCurrentActiveProfileSession(req, profileId) {
  const trustedOrigin = getTrustedAppOrigin(req);
  if (!trustedOrigin) {
    return false;
  }

  const activeSession = getActiveProfileSession(db, trustedOrigin);
  return activeSession?.profile_id === profileId;
}

function assertCanInitializeUnlockedProfilePin(req, profile) {
  if (isProfileLocked(profile)) {
    return;
  }

  const requestedProfileId = parseRequestedProfileId(req.query.profileId);
  const trustedOrigin = getTrustedAppOrigin(req);
  const activeSession = getActiveProfileSession(db, trustedOrigin);
  const activeProfileToken = req.get(ACTIVE_PROFILE_TOKEN_HEADER);
  if (
    requestedProfileId === profile.id
    && activeSession?.profile_id === profile.id
    && verifyActiveProfileToken(
      profile,
      activeProfileToken,
      PROFILE_PIN_TOKEN_SECRET,
      new Date(),
      trustedOrigin,
      activeSession.session_nonce,
    )
  ) {
    return;
  }

  throw new ProfilePinError(
    403,
    'You can only add a PIN to the currently active profile',
    'PROFILE_PIN_AUTH_REQUIRED',
  );
}

app.use((req, res, next) => {
  if (/^\/(health|status|ready|live)$/.test(req.path) ||
      /^\/api\/(health|status|ready|live)(\/|$)/.test(req.path)) {
    return next();
  }

  const raw = req.query.profileId || req.headers['x-profile-id'] || req.body?.profileId;
  if (raw === undefined || raw === null || raw === '') {
    req.profileId = 1;
    return next();
  }

  const id = parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({
      error: 'Invalid profileId',
      code: 'INVALID_PROFILE_ID',
    });
  }

  const exists = db.prepare('SELECT 1 FROM profiles WHERE id = ?').get(id);
  if (!exists) {
    return res.status(404).json({
      error: 'Profile not found',
      code: 'PROFILE_NOT_FOUND',
    });
  }

  req.profileId = id;
  next();
});

app.use((req, res, next) => {
  if (!Number.isInteger(req.profileId)) {
    return next();
  }

  const profile = db.prepare('SELECT id, pin_hash, pin_salt, pin_updated_at FROM profiles WHERE id = ?').get(req.profileId);
  if (!profile || !isProfileLocked(profile)) {
    return next();
  }

  const unlockToken = req.get(PROFILE_UNLOCK_TOKEN_HEADER);
  if (verifyProfileUnlockToken(profile, unlockToken, PROFILE_PIN_TOKEN_SECRET)) {
    return next();
  }

  return res.status(423).json({
    error: 'Profile is locked. Enter the PIN to continue.',
    code: 'PROFILE_LOCKED',
  });
});

// ==================== PROFILE HELPERS ====================

function getProfileId(req) {
  return req.profileId;
}

function getProfileSettings(profileId) {
  let settings = db.prepare('SELECT * FROM user_settings WHERE profile_id = ?').get(profileId);
  if (!settings) {
    // Only auto-create settings for profiles that actually exist
    const profileExists = db.prepare('SELECT 1 FROM profiles WHERE id = ?').get(profileId);
    if (!profileExists) {
      return db.prepare('SELECT * FROM user_settings WHERE profile_id = 1').get();
    }
    db.prepare('INSERT INTO user_settings (profile_id, max_level) VALUES (?, ?)').run(profileId, 'B2');
    settings = db.prepare('SELECT * FROM user_settings WHERE profile_id = ?').get(profileId);
  }
  return settings;
}

function handleVocabularyError(res, error, context) {
  console.error(context, error);

  if (error instanceof VocabularyApiError || error instanceof ProfilePinError || (error && Number.isInteger(error.status))) {
    return res.status(error.status).json({
      error: error.message,
      code: error.code,
      ...(error.details && typeof error.details === 'object' ? error.details : {}),
    });
  }

  return res.status(500).json({ error: error.message });
}

function buildHealthResponse() {
  db.prepare('SELECT 1 AS ok').get();

  return {
    status: 'healthy',
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    checks: {
      database: 'healthy',
      gemini: geminiEnabled ? 'configured' : 'not_configured',
    },
    features: {
      aiChat: geminiEnabled,
      curriculum: true,
      vocabulary: true,
    },
  };
}

function ensureGeminiAvailable(res, unavailableFeatures) {
  if (genAI) {
    return true;
  }

  res.status(503).json({
    error: 'Gemini-powered features are unavailable because GEMINI_API_KEY is not configured.',
    unavailableFeatures,
  });
  return false;
}

app.get(
  ['/health', '/status', '/ready', '/live', '/api/health', '/api/status', '/api/ready', '/api/live'],
  (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json(buildHealthResponse());
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(500).json({
        status: 'unhealthy',
        service: SERVICE_NAME,
        timestamp: new Date().toISOString(),
        checks: {
          database: 'unhealthy',
          gemini: geminiEnabled ? 'configured' : 'not_configured',
        },
        error: error.message,
      });
    }
  }
);

// Уровни испанского языка по приоритету
const LEVEL_PRIORITY = {
  'A1': 6,
  'A2': 5,
  'B1': 4,
  'B2': 3,
  'C1': 2,
  'C2': 1
};

// Get context for LLM
function getTopicsContext(profileId) {
  const settings = getProfileSettings(profileId);
  const maxLevelPriority = LEVEL_PRIORITY[settings.max_level] || 1;

  // Active topics (in_progress or mastered) from curriculum_progress
  const activeTopics = db.prepare(`
    SELECT ct.name, ct.category, ct.level,
           cp.score, cp.success_count, cp.failure_count
    FROM curriculum_topics ct
    INNER JOIN curriculum_progress cp ON cp.topic_id = ct.id AND cp.profile_id = ?
    WHERE cp.status != 'not_started'
    ORDER BY cp.score ASC, ct.level DESC
  `).all(profileId);
  const relevantTopics = activeTopics.filter(t => LEVEL_PRIORITY[t.level] >= maxLevelPriority);

  // All curriculum topic names for AI reference
  // Only include preset topics and AI-detected topics this profile has interacted with,
  // so that novel AI-detected topics from other profiles do not leak into the prompt.
  const curriculumNames = db.prepare(
    `SELECT ct.name, ct.level, ct.category FROM curriculum_topics ct
     WHERE ct.source = 'preset'
        OR ct.id IN (SELECT topic_id FROM curriculum_progress WHERE profile_id = ?)
     ORDER BY ct.level, ct.category, ct.pedagogical_order ASC, ct.id ASC`
  ).all(profileId);
  const curriculumByLevel = {};
  for (const ct of curriculumNames) {
    if (!curriculumByLevel[ct.level]) curriculumByLevel[ct.level] = [];
    curriculumByLevel[ct.level].push(ct.name);
  }

  const curriculumRef = Object.entries(curriculumByLevel)
    .map(([level, names]) => `${level}: ${names.join(', ')}`)
    .join('\n');

  let context = `User is learning Spanish (max level: ${settings.max_level}).\n\n`;

  if (relevantTopics.length > 0) {
    context += `Topics being tracked (score shows progress - lower means needs more practice):\n`;
    context += relevantTopics.map(t =>
      `- ${t.name} (${t.category}, level ${t.level}): score=${t.score.toFixed(1)}, successes=${t.success_count}, mistakes=${t.failure_count}`
    ).join('\n');
    context += '\n\n';
  }

  context += `CURRICULUM TOPIC NAMES (use these exact names in TOPICS_UPDATE when possible):\n${curriculumRef}\n\n`;

  context += `TEACHING STRATEGY:
1. Suggest tasks based on topics with LOW scores (those need more practice)
2. After user's answer to a TASK, evaluate correctness and update topics
3. If you notice a NEW REAL MISTAKE (not a typo), create a new topic
4. When user uses correct grammar, track it as success
5. Work on specific topics upon user's request
6. Maintain natural dialogue IN SPANISH

IMPORTANT: Track BOTH mistakes AND successes in ALL interactions. Be gentle when correcting in casual chat. When tracking, prefer using the exact curriculum topic names listed above.`;

  return context;
}

// Tag stripping now handled by shared lib/tagParser.js

// API: Чат с ЛЛМ
app.post('/api/chat', async (req, res) => {
  if (!ensureGeminiAvailable(res, ['aiChat'])) {
    return;
  }

  const profileId = getProfileId(req);

  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required and must be a non-empty string' });
    }

    // Сохранение сообщения пользователя
    db.prepare('INSERT INTO chat_history (role, content, profile_id) VALUES (?, ?, ?)').run('user', message, profileId);

    // Получение истории чата (последние 10 сообщений)
    const history = db.prepare('SELECT role, content FROM chat_history WHERE profile_id = ? ORDER BY id DESC LIMIT 10').all(profileId).reverse();

    const systemPrompt = `You are a friendly and professional Spanish language tutor specializing in Argentine Spanish (Rioplatense dialect). Your tasks:
1. Help the user learn Argentine Spanish through natural dialogue IN SPANISH ONLY
2. Give varied learning activities: casual chat, exercises, recommendations
3. Track mistakes and successes
4. After each user's answer to a task, evaluate it and report the result

${getTopicsContext(profileId)}

ARGENTINE DIALECT (RIOPLATENSE) RULES:
- Use voseo ALWAYS for informal singular addressing (use "vos" instead of "tú", and matching present tense verb forms like "sos", "tenés", "hablás", "querés", "estás", "escribís").
- Never use "vosotros" or "vosotras" for informal plural addressing. Always use "ustedes" (with third-person plural conjugations).
- Use Argentine vocabulary and idioms where appropriate (e.g., use "auto" instead of "coche", "computadora" instead of "ordenador", "lindo" instead of "bonito", "plata" instead of "dinero", "chau" instead of "adiós").
- Occasionally introduce and explain common Argentine slang (Lunfardo) like "che", "pibe", "mina", "laburo" (work), "copado" (cool), "guita" (money), "morfar" (to eat), or "birra" (beer) to enrich the student's cultural fluency.
- In speech evaluation and pronunciation explanations, emphasize the Argentine pronunciation (e.g. sheísmo/zheísmo: pronouncing "y" and "ll" as [sh] or [zh]).

TEACHING APPROACH:
- VARY your responses: casual conversation → interactive exercises → video/resource recommendations
- Always respect user's choice - if they decline an activity, continue naturally
- For exercises, use the interactive format below
- Suggest relevant YouTube videos or resources occasionally (especially for topics with low scores)
- Keep it engaging and natural - don't force activities

INTERACTIVE EXERCISE FORMAT:
When giving a quiz/exercise, use this JSON format:
[EXERCISE: {"type": "multiple-choice|fill-blank|open", "question": "Your question here", "options": ["A", "B", "C", "D"], "correctAnswer": "B", "topic": "Grammar", "level": "A2"}]

Example multiple-choice:
¡Vamos a practicar el pretérito! Aquí tenés un ejercicio rápido:
[EXERCISE: {"type": "multiple-choice", "question": "Ayer, yo ___ al supermercado.", "options": ["voy", "fui", "iba", "iré"], "correctAnswer": "fui", "topic": "Preterite tense (irregular verbs)", "level": "A2"}]

Example fill-blank:
[EXERCISE: {"type": "fill-blank", "question": "Ella ___ (ser/estar) contenta ayer.", "correctAnswer": "estaba", "topic": "Ser vs Estar (basic)", "level": "A1"}]

Example open question:
[EXERCISE: {"type": "open", "question": "Escribe una oración sobre lo que hiciste el fin de semana pasado usando el pretérito.", "topic": "Preterite tense (regular verbs)", "level": "A2"}]

TOPICS UPDATE - MANDATORY:
**EVERY TIME** a user answers an exercise (correct or incorrect), you MUST include:
[TOPICS_UPDATE: {"updates": [{"topic": "topic name", "category": "grammar/vocabulary/pronunciation/etc", "level": "A1-C2", "success": true/false}]}]

NO EXCEPTIONS - This is automatic, not optional.

When user answers CORRECTLY:
Response: "¡Excelente! 'Fui' es la respuesta correcta. 🎉
[TOPICS_UPDATE: {"updates": [{"topic": "Preterite tense (irregular verbs)", "category": "Grammar", "level": "A2", "success": true}]}]"

When user answers INCORRECTLY:
Response: "¡Casi! La respuesta correcta es 'estaba'.
[TOPICS_UPDATE: {"updates": [{"topic": "Ser vs Estar (basic)", "category": "Grammar", "level": "A1", "success": false}]}]"

CRITICAL: Do NOT say "let's add this topic" - just include the tag directly. The topic will be created automatically.

VOCABULARY SYSTEM:
When user asks about a word meaning, or you introduce a new useful word, you can add it to their vocabulary:
[VOCAB_ADD: {"word": "word here", "translation": "перевод здесь", "example": "Example sentence with the word."}]

Example:
¡Buena pregunta! "Madrugada" significa las primeras horas de la mañana, antes del amanecer.
[VOCAB_ADD: {"word": "madrugada", "translation": "раннее утро, предрассветные часы", "example": "Llegamos a casa de madrugada."}]

WHAT TO TRACK AND HOW:

📚 Use [TOPICS_UPDATE: ...] for GRAMMAR topics — BOTH mistakes AND correct usage:
- Wrong verb conjugation, ser/estar confusion, gender agreement errors → success: false
- Subjunctive errors: using indicative where subjunctive is needed → success: false
- Preposition mistakes: wrong use of por/para, a/en → success: false
- Word order or sentence structure errors → success: false
- **ALSO track when user CORRECTLY uses grammar**: if user writes a correct sentence using subjunctive, preterite vs imperfect, conditionals, etc. → success: true

📖 Use [VOCAB_ADD: ...] for VOCABULARY/SPELLING issues:
- Misspelled words (e.g. "bienos" → "buenos")
- Wrong word choice, false friends (e.g. "embarazada" ≠ "embarrassed")
- New useful words the user doesn't know

❌ Don't track:
- Simple accent mark issues on isolated occasions
- One-time obvious typos (single letter off)

TRACKING CORRECT GRAMMAR IN CASUAL CHAT:
When user writes grammatically correct sentences, notice the grammar structures they used well and track them!
Example: User says "Si hubiera tenido más tiempo, habría viajado a Argentina."
→ Track: [TOPICS_UPDATE: {"updates": [{"topic": "Si clauses (real and unreal conditions)", "category": "Grammar", "level": "B2", "success": true}]}]

Example: User says "Llevo tres años viviendo aquí."
→ Track: [TOPICS_UPDATE: {"updates": [{"topic": "Perifrasis verbales (ir + gerundio, llevar + gerundio)", "category": "Grammar", "level": "C1", "success": true}]}]

Don't track every single sentence — only when the user demonstrates a notable grammar structure (subjunctive, conditionals, perfect tenses, passive voice, relative clauses, etc.)

CASUAL CONVERSATION ERROR CORRECTION:
When user makes mistakes in casual chat, you MUST:
1. Gently point out the error in a friendly way
2. For grammar errors → use [TOPICS_UPDATE: ...] to create/update a grammar topic
3. For spelling/vocabulary errors → use [VOCAB_ADD: ...] to add the correct word to their dictionary
4. Don't interrupt the flow of conversation - correct naturally within your response

Example (spelling/vocab error):
User: "Yo soy muy embarazado porque no entendo la pregunta"
Response: "¡No te preocupés! Un par de cositas:
- Se dice **avergonzado**, no 'embarazado' — 'embarazada' significa 'pregnant' 😊
- Y **entiendo**, no 'entendo' — es un verbo con cambio de raíz (e→ie).
[VOCAB_ADD: {"word": "avergonzado", "translation": "смущённый", "example": "Estoy avergonzado porque cometí un error."}]
[VOCAB_ADD: {"word": "entender", "translation": "понимать", "example": "No entiendo la pregunta."}]"

Example (grammar error):
User: "Ayer yo soy 25 años y fui a una fiesta"
Response: "¡Qué bien! Pequeña nota gramatical: se dice '**tengo** 25 años' (no 'soy'), porque en español usamos **tener** para la edad 😊
[TOPICS_UPDATE: {"updates": [{"topic": "Tener (to have) and tener expressions", "category": "Grammar", "level": "A1", "success": false}]}]"

Example (correct grammar noticed):
User: "Si hubiera sabido de la fiesta, habría ido."
Response: "¡Qué buena historia! Y excelente uso de la condicional mixta, por cierto. 👏
[TOPICS_UPDATE: {"updates": [{"topic": "Si clauses (real and unreal conditions)", "category": "Grammar", "level": "B2", "success": true}]}]"

IMPORTANT RULES:
- Always communicate in Spanish, even if user writes in another language
- If user declines an activity, say "¡No hay problema! ¿Qué te gustaría hacer?"
- Vary your approach naturally - don't be too rigid
- Celebrate successes enthusiastically
- Be encouraging with mistakes - correct them gently, never mock
- Add useful vocabulary when teaching new words
- Use [TOPICS_UPDATE: ...] ONLY for grammar, use [VOCAB_ADD: ...] for words/spelling
- When tracking topics, try to use exact names from the CEFR curriculum when possible`;

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemPrompt
    });

    const chat = model.startChat({
      history: history.slice(0, -1).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }))
    });

    // Таймаут и retry логика
    const timeout = 30000; // 30 секунд
    const maxRetries = 2;
    let responseText = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await Promise.race([
          chat.sendMessage(message),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), timeout)
          )
        ]);
        responseText = result.response.text();
        break;
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw error;
        }
        console.log(`Retry attempt ${attempt + 1}...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!responseText) {
      throw new Error('Failed to get response from AI');
    }

    // Re-validate profile existence after the async Gemini call.
    // The profile may have been deleted while we were awaiting the AI response.
    const profileStillExists = db.prepare('SELECT 1 FROM profiles WHERE id = ?').get(profileId);
    if (!profileStillExists) {
      // Return the AI response to the caller but skip all DB writes
      // to avoid orphan rows in chat_history / vocabulary / curriculum_progress.
      const cleanResponse = stripTags(
        stripTags(
          stripTags(responseText, '[TOPICS_UPDATE: '),
          '[VOCAB_ADD: '
        ),
        '[EXERCISE: '
      ).trim();
      return res.status(200).json({
        response: cleanResponse,
        profileDeleted: true,
      });
    }

    // Парсинг обновлений тем — handle ALL TOPICS_UPDATE tags
    const topicChanges = [];

    for (const updates of extractAllTags(responseText, '[TOPICS_UPDATE: ')) {
      if (updates.updates) {
        for (const update of updates.updates) {
          try {
            const result = updateTopic(update.topic, update.category, update.level, update.success, profileId);
            if (result) {
              topicChanges.push(result);
            }
          } catch (e) {
            console.error('Error processing topic update:', e);
          }
        }
      }
    }

    // Парсинг добавления слов в словарь — handle ALL VOCAB_ADD tags
    for (const vocab of extractAllTags(responseText, '[VOCAB_ADD: ')) {
      try {
        createVocabularyEntry(db, profileId, vocab);
      } catch (e) {
        if (e?.code === 'DUPLICATE_WORD') {
          continue;
        }
        console.error('Error processing vocab add:', e);
      }
    }

    // Extract EXERCISE data before stripping all tags
    const exerciseData = extractFirstTag(responseText, '[EXERCISE: ');

    const cleanResponse = stripTags(
      stripTags(
        stripTags(responseText, '[TOPICS_UPDATE: '),
        '[VOCAB_ADD: '
      ),
      '[EXERCISE: '
    ).trim();

    // Сохранение ответа ассистента
    db.prepare('INSERT INTO chat_history (role, content, profile_id) VALUES (?, ?, ?)').run('assistant', cleanResponse, profileId);

    res.json({
      response: cleanResponse,
      exercise: exerciseData || undefined,
      topicChanges: topicChanges.length > 0 ? topicChanges : undefined
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Функция обновления темы — writes progress to curriculum_progress
function updateTopic(name, category, level, success, profileId, topicId = null, attempt = {}) {
  let existing = null;
  if (topicId) {
    existing = db.prepare('SELECT * FROM curriculum_topics WHERE id = ?').get(topicId);
  }
  if (!existing && name) {
    existing = db.prepare('SELECT * FROM curriculum_topics WHERE LOWER(name) = LOWER(?)').get(name);
  }

  // Fuzzy match if no exact match — but only when unambiguous
  if (!existing) {
    const fuzzyMatches = db.prepare(
      `SELECT * FROM curriculum_topics
       WHERE LOWER(?) LIKE '%' || LOWER(name) || '%'
       OR LOWER(name) LIKE '%' || LOWER(?) || '%'`
    ).all(name, name);

    if (fuzzyMatches.length === 1) {
      existing = fuzzyMatches[0];
    } else if (fuzzyMatches.length > 1) {
      // Multiple candidates — skip to avoid misattributing progress
      console.warn(
        `Ambiguous fuzzy topic match for "${name}": ` +
        `${fuzzyMatches.length} candidates [${fuzzyMatches.map(m => m.name).join(', ')}]. ` +
        `Skipping — creating new topic instead.`
      );
    }
  }

  // A1 progress is evidence-based: one click or a same-day answer streak
  // cannot mark a topic as mastered. A2+ keeps its legacy behavior.
  if (existing?.level === 'A1' && existing.source !== 'ai_detected') {
    const before = db.prepare(
      'SELECT score FROM curriculum_progress WHERE topic_id = ? AND profile_id = ?'
    ).get(existing.id, profileId);
    const eventId = String(
      attempt.eventId
      || `legacy-${profileId}-${existing.id}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    );
    const adaptive = recordA1Attempt(db, profileId, {
      topicId: existing.id,
      eventId,
      correct: success,
      quality: attempt.quality,
      hintsUsed: attempt.hintsUsed,
      responseMs: attempt.responseMs,
      activityType: attempt.activityType || 'legacy_exercise',
    });
    return {
      isNew: false,
      name: existing.name,
      success,
      adaptive: true,
      scoreChange: adaptive.state.masteryScore - Math.round(Number(before?.score || 0)),
      newScore: adaptive.state.masteryScore,
      mastery: adaptive.state,
      replayed: adaptive.replayed,
    };
  }

  if (existing) {
    // Get or create progress for this profile
    let progress = db.prepare(
      'SELECT * FROM curriculum_progress WHERE topic_id = ? AND profile_id = ?'
    ).get(existing.id, profileId);

    if (!progress) {
      db.prepare(
        'INSERT INTO curriculum_progress (topic_id, profile_id, status, score) VALUES (?, ?, ?, 0)'
      ).run(existing.id, profileId, 'not_started');
      progress = { score: 0 };
    }

    if (progress.is_locked) {
      // Locked at 100% — score NEVER decreases, status stays mastered
      db.prepare(`
        UPDATE curriculum_progress
        SET score = 100, status = 'mastered',
            success_count = success_count + ?,
            failure_count = failure_count + ?,
            last_practiced = CURRENT_TIMESTAMP
        WHERE topic_id = ? AND profile_id = ?
      `).run(success ? 1 : 0, success ? 0 : 1, existing.id, profileId);
      return { isNew: false, name: existing.name, scoreChange: 0, newScore: 100, success };
    }

    const scoreChange = success ? 5 : -10;
    const newScore = Math.max(0, Math.min(100, progress.score + scoreChange));
    const newStatus = newScore >= 80 ? 'mastered' : 'in_progress';

    db.prepare(`
      UPDATE curriculum_progress
      SET score = ?, status = ?,
          success_count = success_count + ?,
          failure_count = failure_count + ?,
          last_practiced = CURRENT_TIMESTAMP
      WHERE topic_id = ? AND profile_id = ?
    `).run(newScore, newStatus, success ? 1 : 0, success ? 0 : 1, existing.id, profileId);

    return {
      isNew: false,
      name: existing.name,
      scoreChange,
      newScore: Math.round(newScore),
      success
    };
  } else {
    // AI detected a new topic — add definition to curriculum_topics
    // Normalize CEFR level: invalid AI-provided values fall back to A1
    // to prevent ghost topics that never appear in level-filtered views.
    const safeLevel = VALID_CEFR_LEVELS.includes(level) ? level : DEFAULT_CEFR_LEVEL;

    // Atomic: create topic + its initial progress row in one transaction
    const createTopicWithProgress = db.transaction((name, category, safeLevel, profileId, success) => {
      const result = db.prepare(`
        INSERT INTO curriculum_topics (name, category, level, source)
        VALUES (?, ?, ?, 'ai_detected')
      `).run(name, category, safeLevel);

      const topicId = result.lastInsertRowid;
      const initialScore = success ? 50 : 0;

      db.prepare(`
        INSERT INTO curriculum_progress (topic_id, profile_id, status, score, success_count, failure_count, last_practiced)
        VALUES (?, ?, 'in_progress', ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(topicId, profileId, initialScore, success ? 1 : 0, success ? 0 : 1);

      return { topicId, initialScore };
    });

    createTopicWithProgress(name, category, safeLevel, profileId, success);

    return {
      isNew: true,
      name,
      category,
      level: safeLevel,
      success
    };
  }
}

// API: Получение всех тем (profile-scoped via curriculum_progress)
app.get('/api/topics', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const settings = getProfileSettings(profileId);
    const maxLevelPriority = LEVEL_PRIORITY[settings.max_level] || 1;

    const topics = db.prepare(`
      SELECT ct.id, ct.name, ct.category, ct.level, ct.source, ct.created_at,
             cp.status, cp.score, COALESCE(cp.is_locked, 0) as is_locked, cp.success_count, cp.failure_count, cp.last_practiced
      FROM curriculum_topics ct
      INNER JOIN curriculum_progress cp ON cp.topic_id = ct.id AND cp.profile_id = ?
      WHERE cp.status != 'not_started'
      ORDER BY cp.score ASC, ct.level DESC
    `).all(profileId);
    const relevantTopics = topics.filter(t => LEVEL_PRIORITY[t.level] >= maxLevelPriority);

    res.json({ topics: relevantTopics, maxLevel: settings.max_level });
  } catch (error) {
    console.error('Error fetching topics:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Обновление уровня пользователя
app.post('/api/settings', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const { maxLevel, darkMode, notificationsEnabled } = req.body;
    const settings = getProfileSettings(profileId);

    if (maxLevel) {
      if (!VALID_CEFR_LEVELS.includes(maxLevel)) {
        return res.status(400).json({ error: `Invalid CEFR level: ${maxLevel}. Valid levels: ${VALID_CEFR_LEVELS.join(', ')}` });
      }
      db.prepare('UPDATE user_settings SET max_level = ? WHERE profile_id = ?').run(maxLevel, profileId);
    }
    if (darkMode !== undefined) {
      db.prepare('UPDATE user_settings SET dark_mode = ? WHERE profile_id = ?').run(darkMode ? 1 : 0, profileId);
    }
    if (notificationsEnabled !== undefined) {
      db.prepare('UPDATE user_settings SET notifications_enabled = ? WHERE profile_id = ?').run(notificationsEnabled ? 1 : 0, profileId);
    }

    const updated = db.prepare('SELECT * FROM user_settings WHERE profile_id = ?').get(profileId);
    res.json(updated);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Получение настроек
app.get('/api/settings', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const settings = getProfileSettings(profileId);
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// API: GENERATE PERSONALIZED EXERCISES (Batch of 10 & Nuanced AI Grammar)
// ==========================================
app.post('/api/exercises/generate', async (req, res) => {
  try {
    const profileId = getProfileId(req);
    const { topicId, type } = req.body || {};

    const allWords = db.prepare('SELECT id, word, translation, example, learned_permanently_at FROM vocabulary WHERE profile_id = ?').all(profileId);
    const learnedWords = allWords.filter((w) => w.learned_permanently_at !== null && w.learned_permanently_at !== undefined);
    const activeWords = allWords.filter((w) => !w.learned_permanently_at);

    let selectedPool = [];
    let vocabularySource = 'combined';
    let poolCount = allWords.length;
    let poolLabel = 'Все слова словаря';

    if (learnedWords.length >= 100) {
      selectedPool = learnedWords;
      vocabularySource = 'learned_forever';
      poolCount = learnedWords.length;
      poolLabel = `Полностью выученные слова (${learnedWords.length})`;
    } else if (activeWords.length >= 100) {
      selectedPool = activeWords;
      vocabularySource = 'active_studying';
      poolCount = activeWords.length;
      poolLabel = `Изучаемые слова (${activeWords.length})`;
    } else {
      selectedPool = allWords.length > 0 ? allWords : [{ word: 'casa', translation: 'дом', example: 'Mi casa es grande.' }];
      vocabularySource = 'combined';
      poolCount = allWords.length;
      poolLabel = `Все слова (${allWords.length})`;
    }

    const sampledWords = [...selectedPool].sort(() => 0.5 - Math.random()).slice(0, 20);
    const vocabListStr = sampledWords.map((w) => `${w.word} (${w.translation})`).join(', ');

    let topicObj = { name: 'General Grammar & Vocabulary Practice', category: 'Grammar', level: 'A2' };

    if (topicId && topicId !== 'all') {
      const topicRow = db.prepare('SELECT id, name, category, level FROM curriculum_topics WHERE id = ?').get(topicId);
      if (topicRow) {
        topicObj = topicRow;
      }
    }

    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    const prompt = `You are an elite Spanish language professor and curriculum examiner.
Your mission is to generate a cohesive set of 10 interactive practice exercises for a student practicing the CEFR topic: "${topicObj.name}" (${topicObj.category}, Level: ${topicObj.level}).

CRITICAL MANDATORY INSTRUCTIONS:
1. GRAMMAR TOPIC & COMPREHENSIVE NUANCE COVERAGE:
   - All 10 exercises MUST strictly test the specific grammar mechanism of "${topicObj.name}".
   - ACROSS THE 10 EXERCISES, YOU MUST SYSTEMATICALLY COVER DIFFERENT NUANCES, ASPECTS, AND SUB-RULES OF THIS TOPIC:
     * Different grammatical persons (yo, tú, vos, él/ella/usted, nosotros, ellos/ellas/ustedes; 1st/2nd/3rd singular/plural).
     * Affirmative sentences, negative sentences (no...), and interrogative/question sentences (¿...?).
     * Regular forms vs irregular roots/stem changes/exceptions relevant to this topic.
     * Different contextual situations (formal vs informal, different trigger verbs or prepositions).
   - DO NOT repeat the same sentence structure or grammatical person repeatedly! Ensure variety and progressive pedagogical depth across the 10 tasks.
   - DO NOT just ask for plain vocabulary translations of isolated words. Every exercise must be a meaningful sentence testing the grammar rule.

2. UNAMBIGUOUS PROMPTS & ALTERNATIVE ANSWERS:
   - When testing pronouns, regional forms (e.g. tú vs vos, vosotros vs ustedes), or any rule with multiple possibilities:
     * The question in Russian must be clear (e.g. specify "(ты / tú)" or "(ты / vos / Аргентина)" if dialect matters).
     * Always provide "alternativeAnswers" listing all valid synonyms, acceptable regional variations, and common accent-less spellings (e.g. ["tú", "tu", "vos"]).
   - For fill-blank and open questions, "correctAnswer" should be the canonical answer, and "alternativeAnswers" must include all other acceptable forms.

3. STUDENT VOCABULARY INTEGRATION:
   - Embed words from the student's vocabulary pool across the 10 exercises: ${vocabListStr}.
   - Naturally integrate these vocabulary words into the subjects, objects, or context of the sentences.

4. ACCURATE RUSSIAN EXPLANATIONS:
   - Every exercise MUST include a clear, detailed, linguistically precise "explanation" in Russian.
   - If a specific form is required by the verb conjugation (e.g. "estudias" is conjugated for "tú", whereas "estudiás" is for "vos"), explicitly explain this conjugation and stress rule!
   - NEVER contradict the validation or write confusing statements.

OUTPUT FORMAT:
Respond ONLY with a valid JSON object matching this exact schema:
{
  "exercises": [
    {
      "type": "multiple-choice" | "fill-blank" | "open",
      "question": "Question or sentence in Spanish (with Russian instructions/context if needed)",
      "options": ["Option A", "Option B", "Option C", "Option D"], // if multiple-choice
      "correctAnswer": "exact correct answer string",
      "alternativeAnswers": ["alternative acceptable answer 1", "alternative acceptable answer 2"],
      "explanation": "Clear grammatical explanation in Russian explaining why this answer fits",
      "topic": "${topicObj.name}",
      "level": "${topicObj.level}",
      "targetWord": "Spanish word from student vocabulary used in this exercise",
      "targetWordTranslation": "Russian translation"
    }
  ]
}`;

    let exercises = [];
    const aiModels = ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
    for (const m of aiModels) {
      try {
        const aiRes = await Promise.race([
          fetch(`http://127.0.0.1:58433/v1beta/models/${m}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json', temperature: 0.7 }
            })
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 35000))
        ]);

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const rawJson = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
          const parsed = JSON.parse(rawJson);
          if (Array.isArray(parsed.exercises) && parsed.exercises.length > 0) {
            exercises = parsed.exercises.map(ex => ({
              ...ex,
              topicId: topicObj.id,
              topic: topicObj.name,
              level: topicObj.level
            }));
            break;
          } else if (parsed.question && parsed.correctAnswer) {
            exercises = [parsed];
            break;
          }
        }
      } catch (err) {
        console.warn(`Model ${m} error in batch generation:`, err.message);
      }
    }

    // Fallback if AI generation fails
    if (!exercises || exercises.length === 0) {
      const single = generateSpanishExercise({
        topic: topicObj,
        exerciseType: type || 'multiple-choice',
        targetWordObj: selectedPool[0],
        allUserWords: selectedPool
      });
      exercises = [single];
    }

    exercises.forEach((ex) => {
      ex.vocabularySource = vocabularySource;
      ex.wordPoolCount = poolCount;
      ex.sourceLabel = poolLabel;
    });

    return res.json({
      exercises,
      exercise: exercises[0], // backwards compatibility
      count: exercises.length,
      vocabularySource,
      wordPoolCount: poolCount,
      sourceLabel: poolLabel
    });
  } catch (error) {
    console.error('Error in /api/exercises/generate:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ==========================================
// API: GENERATE FULL-SENTENCE TRANSLATION EXERCISES (Multi-topic & Mastered Vocabulary)
// ==========================================
app.post('/api/exercises/generate-translation', async (req, res) => {
  try {
    const profileId = getProfileId(req);
    const { topicIds } = req.body || {};

    const allWords = db.prepare('SELECT id, word, translation, example, learned_permanently_at FROM vocabulary WHERE profile_id = ?').all(profileId);
    const learnedWords = allWords.filter((w) => w.learned_permanently_at !== null && w.learned_permanently_at !== undefined);
    const activeWords = allWords.filter((w) => !w.learned_permanently_at);

    let selectedPool = [];
    let vocabularySource = 'combined';
    let poolCount = allWords.length;
    let poolLabel = 'Все слова словаря';

    if (learnedWords.length >= 100) {
      selectedPool = learnedWords;
      vocabularySource = 'learned_forever';
      poolCount = learnedWords.length;
      poolLabel = `Полностью выученные слова (${learnedWords.length})`;
    } else if (activeWords.length >= 100) {
      selectedPool = activeWords;
      vocabularySource = 'active_studying';
      poolCount = activeWords.length;
      poolLabel = `Изучаемые слова (${activeWords.length})`;
    } else {
      selectedPool = allWords.length > 0 ? allWords : [{ word: 'casa', translation: 'дом' }, { word: 'nuevo', translation: 'новый' }];
      vocabularySource = 'combined';
      poolCount = allWords.length;
      poolLabel = `Все слова (${allWords.length})`;
    }

    const sampledWords = [...selectedPool].sort(() => 0.5 - Math.random()).slice(0, 30);
    const vocabListStr = sampledWords.map((w) => `${w.word} (${w.translation})`).join(', ');

    // Gather selected topic names
    let selectedTopicRows = [];
    if (Array.isArray(topicIds) && topicIds.length > 0) {
      const placeholders = topicIds.map(() => '?').join(',');
      selectedTopicRows = db.prepare(`SELECT id, name, category, level FROM curriculum_topics WHERE id IN (${placeholders})`).all(...topicIds);
    } else if (topicIds && topicIds !== 'all') {
      const single = db.prepare('SELECT id, name, category, level FROM curriculum_topics WHERE id = ?').get(topicIds);
      if (single) selectedTopicRows = [single];
    }

    if (selectedTopicRows.length === 0) {
      selectedTopicRows = db.prepare('SELECT id, name, category, level FROM curriculum_topics ORDER BY RANDOM() LIMIT 2').all();
    }

    const topicsStr = selectedTopicRows.map((t, idx) => `${idx + 1}. ${t.name} (${t.category}, ${t.level})`).join('\n');

    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    const prompt = `You are an elite Spanish language professor.
Your task is to generate 10 full-sentence translation exercises for a student.

SELECTED GRAMMAR TOPIC(S):
${topicsStr}

STUDENT'S MASTERED VOCABULARY POOL (YOU MUST COMPOSE SENTENCES PRIMARILY USING THESE KNOWN WORDS):
${vocabListStr}

CRITICAL MANDATORY INSTRUCTIONS:
1. For each of the 10 tasks:
   - "sourceSentence": A natural, meaningful Russian sentence for the student to translate into Spanish.
   - "targetSentence": The perfect, accurate Spanish translation.
   - "alternativeAnswers": Array of 1-3 valid alternative translations in Spanish (e.g. with/without subject pronouns like 'yo/tú', synonyms).
   - "testedGrammar": Name of the specific grammar topic tested in this sentence.
   - "usedVocabulary": Array of student vocabulary words embedded in this sentence.
   - "explanation": Detailed Russian explanation of the grammar rule, word order, verb conjugations/endings, and why this translation is constructed this way.
2. The sentences MUST strictly practice the chosen grammar topics while weaving together words from the student's vocabulary list.
3. Provide progressive variety across the 10 sentences covering different persons (yo, tú, él/ella, nosotros, ellos), affirmative/negative/questions, and nuances.

Respond ONLY with valid JSON matching this exact schema:
{
  "exercises": [
    {
      "sourceSentence": "Русское предложение для перевода",
      "targetSentence": "Correct Spanish translation",
      "alternativeAnswers": ["Alternative Spanish translation 1"],
      "testedGrammar": "Grammar topic name",
      "usedVocabulary": ["word1", "word2"],
      "explanation": "Подробное объяснение грамматики и перевода на русском языке"
    }
  ]
}`;

    let exercises = [];
    const aiModels = ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
    for (const m of aiModels) {
      try {
        const aiRes = await Promise.race([
          fetch(`http://127.0.0.1:58433/v1beta/models/${m}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json', temperature: 0.7 }
            })
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 35000))
        ]);

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const rawJson = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
          const parsed = JSON.parse(rawJson);
          if (Array.isArray(parsed.exercises) && parsed.exercises.length > 0) {
            exercises = parsed.exercises;
            break;
          }
        }
      } catch (err) {
        console.warn(`Translation generation error on model ${m}:`, err.message);
      }
    }

    if (exercises.length === 0) {
      exercises = [
        {
          sourceSentence: "Дама покупает новое вино в магазине.",
          targetSentence: "La dama compra vino nuevo en la tienda.",
          alternativeAnswers: ["La dama compra un vino nuevo en la tienda."],
          testedGrammar: selectedTopicRows[0]?.name || "Present tense regular -ar verbs",
          usedVocabulary: ["dama", "vino", "nuevo"],
          explanation: "Глагол 'comprar' спрягается в 3-м лице единственного числа (la dama) с окончанием '-a' (compra). Прилагательное 'nuevo' согласуется с мужским родом 'vino'."
        }
      ];
    }

    exercises.forEach((ex, idx) => {
      ex.id = `trans_${Date.now()}_${idx}`;
      ex.vocabularySource = vocabularySource;
      ex.wordPoolCount = poolCount;
      ex.sourceLabel = poolLabel;
    });

    return res.json({
      exercises,
      count: exercises.length,
      vocabularySource,
      wordPoolCount: poolCount,
      sourceLabel: poolLabel,
      selectedTopics: selectedTopicRows
    });
  } catch (error) {
    console.error('Error in /api/exercises/generate-translation:', error);
    return res.status(500).json({ error: error.message });
  }
});


// API: Ручная установка прогресса темы (0%, 100% и Заморозка)
app.post('/api/topics/:id/set-score', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const topicId = Number(req.params.id);
    const { score, isLocked } = req.body || {};

    const topic = db.prepare('SELECT * FROM curriculum_topics WHERE id = ?').get(topicId);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });
    if (topic.level === 'A1') {
      return res.status(409).json({
        error: 'A1 mastery is evidence-based and cannot be set manually',
        code: 'A1_MANUAL_MASTERY_DISABLED',
        courseEndpoint: '/api/a1/course',
      });
    }

    let targetScore = typeof score === 'number' ? Math.max(0, Math.min(100, score)) : (isLocked ? 100 : 0);
    let targetStatus = targetScore >= 80 ? 'mastered' : (targetScore > 0 ? 'in_progress' : 'not_started');
    let targetLocked = isLocked !== undefined ? (isLocked ? 1 : 0) : (targetScore === 100 ? 1 : 0);
    if (targetScore === 0) targetLocked = 0;

    const existing = db.prepare('SELECT * FROM curriculum_progress WHERE topic_id = ? AND profile_id = ?').get(topicId, profileId);
    if (existing) {
      db.prepare(`
        UPDATE curriculum_progress
        SET score = ?, status = ?, is_locked = ?, last_practiced = CURRENT_TIMESTAMP
        WHERE topic_id = ? AND profile_id = ?
      `).run(targetScore, targetStatus, targetLocked, topicId, profileId);
    } else {
      db.prepare(`
        INSERT INTO curriculum_progress (topic_id, profile_id, score, status, is_locked, success_count, failure_count, last_practiced)
        VALUES (?, ?, ?, ?, ?, 0, 0, CURRENT_TIMESTAMP)
      `).run(topicId, profileId, targetScore, targetStatus, targetLocked);
    }

    res.json({ success: true, topicId, score: targetScore, status: targetStatus, isLocked: targetLocked === 1 });
  } catch (error) {
    console.error('Error in /api/topics/:id/set-score:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Ручное обновление темы
app.post('/api/topics/update', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const { topic, category, level, success, topicId, eventId, quality, hintsUsed, responseMs, activityType } = req.body || {};

    if (typeof success !== 'boolean') {
      return res.status(400).json({ error: 'success must be a boolean' });
    }

    let targetTopic = null;
    if (topicId) {
      targetTopic = db.prepare('SELECT * FROM curriculum_topics WHERE id = ?').get(topicId);
    }

    if (!targetTopic && (!topic || typeof topic !== 'string' || !topic.trim())) {
      return res.status(400).json({ error: 'Either valid topicId or non-empty topic name is required' });
    }

    const tName = targetTopic ? targetTopic.name : topic.trim();
    const tCat = targetTopic ? targetTopic.category : (category ? category.trim() : 'Practice');
    const tLvl = targetTopic ? targetTopic.level : (level ? level.trim() : 'A1');

    const result = updateTopic(tName, tCat, tLvl, success, profileId, targetTopic ? targetTopic.id : null, {
      eventId,
      quality,
      hintsUsed,
      responseMs,
      activityType,
    });
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error updating topic:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Удаление/сброс темы progress for this profile
app.delete('/api/topics/:id', (req, res) => {
  const profileId = getProfileId(req);
  const topic = db.prepare('SELECT * FROM curriculum_topics WHERE id = ?').get(req.params.id);
  if (topic) {
    db.prepare('DELETE FROM curriculum_progress WHERE topic_id = ? AND profile_id = ?')
      .run(req.params.id, profileId);
  }
  res.json({ success: true });
});

// API: Получение истории чата
app.get('/api/chat/history', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const history = db.prepare(
      'SELECT role, content, timestamp FROM chat_history WHERE profile_id = ? ORDER BY id ASC'
    ).all(profileId);
    res.json({ history });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Очистка истории чата
app.delete('/api/chat/clear', (req, res) => {
  const profileId = getProfileId(req);
  db.prepare('DELETE FROM chat_history WHERE profile_id = ?').run(profileId);
  res.json({ success: true });
});


// ==================== VOCABULARY GROUPS API ====================

app.get('/api/vocabulary/groups', (req, res) => {
  try {
    const profileId = getProfileId(req);
    res.json({ groups: listVocabularyGroups(db, profileId) });
  } catch (error) {
    handleVocabularyError(res, error, 'Error fetching vocabulary groups:');
  }
});

app.post('/api/vocabulary/groups', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const group = createVocabularyGroup(db, profileId, req.body?.name);
    res.status(201).json({ group, groups: listVocabularyGroups(db, profileId) });
  } catch (error) {
    handleVocabularyError(res, error, 'Error creating vocabulary group:');
  }
});

app.put('/api/vocabulary/groups/:id', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const groupId = Number.parseInt(req.params.id, 10);
    const group = updateVocabularyGroup(db, profileId, groupId, req.body?.name);
    res.json({ group, groups: listVocabularyGroups(db, profileId) });
  } catch (error) {
    handleVocabularyError(res, error, 'Error updating vocabulary group:');
  }
});

app.delete('/api/vocabulary/groups/:id', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const groupId = Number.parseInt(req.params.id, 10);
    deleteVocabularyGroup(db, profileId, groupId);
    res.json({ success: true, groups: listVocabularyGroups(db, profileId) });
  } catch (error) {
    handleVocabularyError(res, error, 'Error deleting vocabulary group:');
  }
});

app.post('/api/vocabulary/groups/:id/words', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const groupId = Number.parseInt(req.params.id, 10);
    const { wordId, wordIds } = req.body || {};
    if (Array.isArray(wordIds)) {
      setGroupWords(db, profileId, groupId, wordIds);
    } else if (wordId) {
      addWordToGroup(db, profileId, groupId, Number(wordId));
    }
    res.json({ success: true, groups: listVocabularyGroups(db, profileId) });
  } catch (error) {
    handleVocabularyError(res, error, 'Error updating group words:');
  }
});

app.delete('/api/vocabulary/groups/:id/words/:wordId', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const groupId = Number.parseInt(req.params.id, 10);
    const wordId = Number.parseInt(req.params.wordId, 10);
    removeWordFromGroup(db, profileId, groupId, wordId);
    res.json({ success: true, groups: listVocabularyGroups(db, profileId) });
  } catch (error) {
    handleVocabularyError(res, error, 'Error removing word from group:');
  }
});

app.put('/api/vocabulary/:id/groups', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const wordId = Number.parseInt(req.params.id, 10);
    const groupIds = Array.isArray(req.body?.groupIds) ? req.body.groupIds : [];
    setWordGroups(db, profileId, wordId, groupIds);
    res.json({ success: true, groups: listVocabularyGroups(db, profileId) });
  } catch (error) {
    handleVocabularyError(res, error, 'Error setting word groups:');
  }
});

// ==================== VOCABULARY API ====================

app.get('/api/vocabulary', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const now = new Date();
    const vocabulary = listVocabularyEntries(db, profileId, now);
    const legacyWords = listLegacyVocabularyWords(db, profileId, now);
    res.json({
      ...vocabulary,
      words: vocabulary.entries.map((entry) => ({
        ...(legacyWords.find((word) => word.id === entry.id) ?? {}),
        card_summary: entry.card_summary,
      })),
    });
  } catch (error) {
    handleVocabularyError(res, error, 'Error fetching vocabulary:');
  }
});

app.get('/api/vocabulary/export', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const profile = db.prepare('SELECT id, name, avatar_emoji FROM profiles WHERE id = ?').get(profileId);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="spanish-vocabulary-profile-${profileId}.json"`);
    res.json(exportVocabularyArchive(db, profile, new Date()));
  } catch (error) {
    handleVocabularyError(res, error, 'Error exporting vocabulary:');
  }
});

app.post('/api/vocabulary/import', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const now = new Date();
    if ((req.vocabularyImportBodyBytes ?? 0) > VOCABULARY_IMPORT_MAX_BYTES) {
      throw new VocabularyApiError(413, 'Vocabulary import file is too large. Exports up to 2 MB are supported.', 'VOCABULARY_IMPORT_TOO_LARGE');
    }
    const summary = importVocabularyArchive(db, profileId, req.body ?? {}, now);
    res.json({
      summary,
      stats: listVocabularyEntries(db, profileId, now).stats,
    });
  } catch (error) {
    handleVocabularyError(res, error, 'Error importing vocabulary:');
  }
});

app.get('/api/vocabulary/study-session', (req, res) => {
  try {
    res.json({ session: getLatestVocabularyStudySession(db, getProfileId(req), req.query?.mode || null) });
  } catch (error) {
    handleVocabularyError(res, error, 'Error fetching vocabulary study session:');
  }
});

app.put('/api/vocabulary/study-session', (req, res) => {
  try {
    const session = saveVocabularyStudySession(
      db,
      getProfileId(req),
      req.body?.mode,
      req.body?.state,
      new Date(),
      { restart: req.body?.restart === true },
    );
    res.json({ session });
  } catch (error) {
    handleVocabularyError(res, error, 'Error saving vocabulary study session:');
  }
});

app.get('/api/vocabulary/review-queue', (req, res) => {
  try {
    const profileId = getProfileId(req);
    res.json(listDueReviewEntries(db, profileId, { limit: req.query.limit, now: new Date() }));
  } catch (error) {
    handleVocabularyError(res, error, 'Error fetching review queue:');
  }
});

app.get('/api/vocabulary/due', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const now = new Date();
    const queue = listDueReviewCards(db, profileId, { limit: req.query.limit, now });
    res.json({
      ...queue,
      words: listLegacyDueVocabularyWords(db, profileId, now),
    });
  } catch (error) {
    handleVocabularyError(res, error, 'Error fetching due review cards:');
  }
});

app.post('/api/vocabulary', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const entry = createVocabularyEntry(db, profileId, req.body ?? {});
    res.status(201).json(entry);
  } catch (error) {
    handleVocabularyError(res, error, 'Error adding word:');
  }
});

app.post('/api/vocabulary/review-cards/:id/review', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const cardId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(cardId) || cardId <= 0) {
      throw new VocabularyApiError(400, 'Review card id must be a positive integer', 'INVALID_CARD_ID');
    }

    const grade = typeof req.body?.grade === 'string' ? req.body.grade : '';
    const updatedCard = reviewVocabularyCard(db, profileId, cardId, grade);
    try {
      updateDailyQuestProgress(db, profileId, 'vocab_review', 1);
      addProfileXp(db, profileId, 3, 'vocab_card_reviewed');
    } catch (e) {
      console.error('Error updating quest progress on vocab review:', e);
    }
    res.json({ card: updatedCard });
  } catch (error) {
    handleVocabularyError(res, error, 'Error reviewing card:');
  }
});

function handleLegacyVocabularyReview(req, res) {
  try {
    const profileId = getProfileId(req);
    const entryId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(entryId) || entryId <= 0) {
      throw new VocabularyApiError(400, 'Vocabulary id must be a positive integer', 'INVALID_VOCAB_ID');
    }

    const reviewedWord = reviewLegacyVocabularyEntry(db, profileId, entryId, req.body ?? {}, new Date());
    try {
      updateDailyQuestProgress(db, profileId, 'vocab_review', 1);
      addProfileXp(db, profileId, 3, 'vocab_card_reviewed');
    } catch (e) {
      console.error('Error updating quest progress on legacy vocab review:', e);
    }
    res.json(reviewedWord);
  } catch (error) {
    handleVocabularyError(res, error, 'Error reviewing legacy vocabulary entry:');
  }
}

app.post('/api/vocabulary/:id/review', handleLegacyVocabularyReview);
app.put('/api/vocabulary/:id/review', handleLegacyVocabularyReview);

app.post('/api/vocabulary/review-cards/:id/learned', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const cardId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(cardId) || cardId <= 0) {
      throw new VocabularyApiError(400, 'Review card id must be a positive integer', 'INVALID_CARD_ID');
    }

    const updatedCard = markVocabularyCardLearned(db, profileId, cardId);
    res.json({ card: updatedCard });
  } catch (error) {
    handleVocabularyError(res, error, 'Error marking card learned:');
  }
});

app.post('/api/vocabulary/:id/learned', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const entryId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(entryId) || entryId <= 0) {
      throw new VocabularyApiError(400, 'Vocabulary id must be a positive integer', 'INVALID_VOCAB_ID');
    }

    const markedWord = markVocabularyEntryLearned(db, profileId, entryId, new Date());
    res.json(markedWord);
  } catch (error) {
    handleVocabularyError(res, error, 'Error marking vocabulary entry learned:');
  }
});

app.patch('/api/vocabulary/:id/favorite', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const entryId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(entryId) || entryId <= 0) {
      throw new VocabularyApiError(400, 'Vocabulary id must be a positive integer', 'INVALID_VOCAB_ID');
    }
    res.json({ entry: setVocabularyFavorite(db, profileId, entryId, req.body?.favorite, new Date()) });
  } catch (error) {
    handleVocabularyError(res, error, 'Error updating vocabulary favorite:');
  }
});

app.put('/api/vocabulary/:id/permanent-learned', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const entryId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(entryId) || entryId <= 0) {
      throw new VocabularyApiError(400, 'Vocabulary id must be a positive integer', 'INVALID_VOCAB_ID');
    }
    res.json({ entry: setVocabularyPermanentlyLearned(db, profileId, entryId, req.body?.learned, new Date()) });
  } catch (error) {
    handleVocabularyError(res, error, 'Error updating permanent learned state:');
  }
});

app.delete('/api/vocabulary/:id', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const entryId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(entryId) || entryId <= 0) {
      throw new VocabularyApiError(400, 'Vocabulary id must be a positive integer', 'INVALID_VOCAB_ID');
    }

    res.json(deleteVocabularyEntry(db, profileId, entryId));
  } catch (error) {
    handleVocabularyError(res, error, 'Error deleting word:');
  }
});

// ==================== CURRICULUM API ====================

// Get all curriculum topics with per-profile progress
app.get(['/api/curriculum', '/api/curriculum/topics'], (req, res) => {
  try {
    const profileId = getProfileId(req);
    const settings = getProfileSettings(profileId);
    const topics = db.prepare(`
      SELECT ct.id, ct.name, ct.category, ct.level, ct.source, ct.created_at,
             CASE WHEN ct.level = 'A1' THEN COALESCE(am.phase, 'new') ELSE COALESCE(cp.status, 'not_started') END as status,
             CASE WHEN ct.level = 'A1' THEN COALESCE(am.mastery_score, 0) ELSE COALESCE(cp.score, 0) END as score,
             CASE WHEN ct.level = 'A1' THEN 0 ELSE COALESCE(cp.is_locked, 0) END as is_locked,
             COALESCE(cp.success_count, 0) as success_count,
             COALESCE(cp.failure_count, 0) as failure_count,
             cp.last_practiced,
             am.stability_days as a1_stability_days,
             am.successful_days as a1_successful_days,
             am.next_review_at as a1_next_review_at
      FROM curriculum_topics ct
      LEFT JOIN curriculum_progress cp ON cp.topic_id = ct.id AND cp.profile_id = ?
      LEFT JOIN a1_topic_mastery am ON am.topic_id = ct.id AND am.profile_id = ?
      WHERE ct.source = 'preset' OR cp.profile_id IS NOT NULL
      ORDER BY ct.level, ct.category, ct.pedagogical_order ASC, ct.id ASC
    `).all(profileId, profileId);
    res.json({ topics, maxLevel: settings.max_level });
  } catch (error) {
    console.error('Error fetching curriculum:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Получение статистики
app.get('/api/stats', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const topicsCount = db.prepare(
      "SELECT COUNT(*) as count FROM curriculum_progress WHERE profile_id = ? AND status != 'not_started'"
    ).get(profileId).count;
    const topicsLowScore = db.prepare(
      "SELECT COUNT(*) as count FROM curriculum_progress WHERE profile_id = ? AND status != 'not_started' AND score < 30"
    ).get(profileId).count;
    const topicsHighScore = db.prepare(
      "SELECT COUNT(*) as count FROM curriculum_progress WHERE profile_id = ? AND score >= 70"
    ).get(profileId).count;

    const vocabularyStats = getVocabularyStats(db, profileId);
    const vocabTotal = vocabularyStats.total_entries;
    const vocabDue = vocabularyStats.due_cards;
    const vocabMastered = vocabularyStats.mastered_entries;

    const chatMessages = db.prepare('SELECT COUNT(*) as count FROM chat_history WHERE profile_id = ?').get(profileId).count;

    res.json({
      topics: {
        total: topicsCount,
        needsPractice: topicsLowScore,
        mastered: topicsHighScore
      },
      vocabulary: {
        total: vocabTotal,
        due: vocabDue,
        mastered: vocabMastered
      },
      chatMessages
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: error.message });
  }
});


// ==================== A1 ADAPTIVE COURSE API ====================

app.get('/api/a1/course', (req, res) => {
  try {
    res.json(getA1CourseSnapshot(db, getProfileId(req)));
  } catch (error) {
    console.error('Error fetching A1 course:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/a1/today', (req, res) => {
  try {
    res.json(getA1TodayPlan(db, getProfileId(req)));
  } catch (error) {
    console.error('Error building A1 today plan:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/a1/attempts', (req, res) => {
  try {
    const result = recordA1Attempt(db, getProfileId(req), req.body || {});
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) {
    console.error('Error recording A1 attempt:', error);
    res.status(Number(error.status) || 500).json({
      error: error.message,
      code: error.code || 'A1_ATTEMPT_ERROR',
    });
  }
});

app.post('/api/a1/skill-evidence', (req, res) => {
  try {
    const result = recordA1SkillEvidence(db, getProfileId(req), req.body || {});
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) {
    console.error('Error recording A1 skill evidence:', error);
    res.status(Number(error.status) || 500).json({
      error: error.message,
      code: error.code || 'A1_SKILL_EVIDENCE_ERROR',
    });
  }
});

app.get('/api/a1/topics/:id/package', (req, res) => {
  try {
    const topicId = Number(req.params.id);
    const guide = getGrammarTheoryGuide(topicId);
    if (!guide) return res.status(404).json({ error: 'Topic package not found' });
    res.json({ package: guide });
  } catch (error) {
    console.error('Error fetching topic package:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/a1/topics/:id/exercises', (req, res) => {
  try {
    const topicId = Number(req.params.id);
    const count = Number(req.query.count) || 8;
    const guide = getGrammarTheoryGuide(topicId);
    if (!guide || !Array.isArray(guide.exercises) || guide.exercises.length === 0) {
      return res.status(404).json({ error: 'Topic exercises not found' });
    }
    const shuffled = [...guide.exercises].sort(() => 0.5 - Math.random()).slice(0, count);
    res.json({
      topicId,
      topicName: guide.topicName,
      russianTitle: guide.russianTitle,
      exercises: shuffled,
      totalAvailable: guide.exercises.length,
    });
  } catch (error) {
    console.error('Error fetching topic exercises:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/a1/checkpoints', (req, res) => {
  try {
    res.json({ checkpoints: getAllA1Checkpoints() });
  } catch (error) {
    console.error('Error fetching checkpoints:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/a1/checkpoints/:unitId', (req, res) => {
  try {
    const checkpoint = getA1CheckpointByUnit(req.params.unitId);
    if (!checkpoint) return res.status(404).json({ error: 'Checkpoint not found' });
    res.json({ checkpoint });
  } catch (error) {
    console.error('Error fetching checkpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/a1/checkpoints/:unitId/submit', (req, res) => {
  try {
    const result = recordA1CheckpointSubmission(db, getProfileId(req), req.params.unitId, req.body || {});
    res.status(200).json(result);
  } catch (error) {
    console.error('Error recording checkpoint submission:', error);
    res.status(Number(error.status) || 500).json({
      error: error.message,
      code: error.code || 'CHECKPOINT_SUBMIT_ERROR',
    });
  }
});

app.get('/api/a1/skills', (req, res) => {
  try {
    const snapshot = getA1CourseSnapshot(db, getProfileId(req));
    res.json({ skills: snapshot.skills });
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/a1/skills/:skill', (req, res) => {
  try {
    const skill = req.params.skill;
    const tasks = getA1SkillTasks(skill);
    res.json({ skill, tasks });
  } catch (error) {
    console.error('Error fetching skill tasks:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/a1/vocabulary/domains', (req, res) => {
  try {
    const snapshot = getA1CourseSnapshot(db, getProfileId(req));
    res.json({ vocabulary: snapshot.vocabulary });
  } catch (error) {
    console.error('Error fetching vocabulary domains:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/a1/vocabulary/domain/:domainId', (req, res) => {
  try {
    const domainId = req.params.domainId;
    const words = getA1VocabularyByDomain(domainId);
    res.json({ domainId, words, count: words.length });
  } catch (error) {
    console.error('Error fetching domain vocabulary:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vocabulary/seed-a1', (req, res) => {
  try {
    const result = seedCoreA1Vocabulary(db, getProfileId(req));
    res.json(result);
  } catch (error) {
    console.error('Error seeding A1 vocabulary:', error);
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// API: EXAMINATIONS (Milestone & Level Mastery)
// ==========================================
app.get('/api/exams/status', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const status = getExamsStatus(db, profileId);
    res.json({ status });
  } catch (error) {
    console.error('Error fetching exam status:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/exams/generate', async (req, res) => {
  try {
    const profileId = getProfileId(req);
    const { level = 'A1', examType = 'milestone', topicIds = [] } = req.body || {};
    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();

    const exam = await generateExamQuestions({
      db,
      profileId,
      level,
      examType,
      topicIds,
      apiKey
    });

    res.json(exam);
  } catch (error) {
    console.error('Error generating exam:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/exams/submit', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const { level = 'A1', examType = 'milestone', topicIds = [], answers = [], durationSeconds = 0 } = req.body || {};

    const result = submitExamResult({
      db,
      profileId,
      level,
      examType,
      topicIds,
      answers,
      durationSeconds
    });

    res.json(result);
  } catch (error) {
    console.error('Error submitting exam:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/exams/history', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const level = req.query.level;
    let query = 'SELECT * FROM curriculum_exams WHERE profile_id = ?';
    const params = [profileId];
    if (level) {
      query += ' AND level = ?';
      params.push(level);
    }
    query += ' ORDER BY id DESC LIMIT 20';
    const history = db.prepare(query).all(...params);
    res.json({ history });
  } catch (error) {
    console.error('Error fetching exam history:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// API: GRAMMAR THEORY & CONTEXTUAL AI TUTOR
// ==========================================
app.get('/api/curriculum/topics/:id/theory', (req, res) => {
  try {
    const topicId = Number(req.params.id);
    const topicRow = db.prepare('SELECT id, name, category, level FROM curriculum_topics WHERE id = ?').get(topicId);
    if (!topicRow) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    const theory = getGrammarTheoryGuide(topicId, topicRow.name);
    res.json({
      topic: topicRow,
      theory: theory || {
        id: topicId,
        topicName: topicRow.name,
        russianTitle: topicRow.name,
        level: topicRow.level,
        category: topicRow.category,
        summary: `Подробное грамматическое правило для темы: ${topicRow.name}`,
        sections: [
          {
            title: '1. Основное правило',
            content: `Правило и грамматические конструкции для темы «${topicRow.name}» (${topicRow.level}). Вы можете задать любой вопрос AI-репетитору ниже!`
          }
        ],
        examples: [],
        commonMistakes: [],
        tutorSuggestions: [
          `Объясни правило «${topicRow.name}» простыми словами`,
          'Приведи 5 живых примеров на эту тему',
          'Дай мне 3 упражнения для проверки этого правила'
        ]
      }
    });
  } catch (error) {
    console.error('Error fetching topic theory:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/curriculum/topics/:id/tutor-chat', async (req, res) => {
  try {
    const profileId = getProfileId(req);
    const topicId = Number(req.params.id);
    const { message, chatHistory = [] } = req.body || {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const topicRow = db.prepare('SELECT id, name, category, level FROM curriculum_topics WHERE id = ?').get(topicId);
    const topicName = topicRow ? topicRow.name : 'Spanish Grammar';
    const topicLevel = topicRow ? topicRow.level : 'A1';

    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      return res.json({
        reply: 'AI Tutor is currently in offline mode. Please configure GEMINI_API_KEY in .env.'
      });
    }

    const systemPrompt = `You are a supportive, warm, and expert Spanish grammar tutor in LinguaLearn.
The student is currently reading the theory guide and practicing the topic: "${topicName}" (Category: ${topicRow?.category || 'Grammar'}, CEFR Level: ${topicLevel}).

RULES FOR YOUR RESPONSES:
1. Explain grammar clearly in RUSSIAN, with short, elegant Spanish examples and Russian translations in parentheses.
2. If the student asks for examples or practice, provide 3-4 realistic conversational Spanish sentences.
3. If the topic involves dialectal aspects (e.g. Argentine vos vs Iberian tú), mention both with gentle clarity.
4. Keep explanations concise, structured (bullet points / bold highlights), and easy to read on mobile.
5. End with an encouraging check question or friendly tip.`;

    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: `¡Hola! Я твой личный репетитор по теме «${topicName}». Готов разобрать любые вопросы, привести примеры или дать тренировочные упражнения. Чем могу помочь?` }] }
    ];

    if (Array.isArray(chatHistory)) {
      for (const msg of chatHistory.slice(-6)) {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: String(msg.content || '') }]
        });
      }
    }

    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    let reply = '';
    const aiModels = ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'];
    for (const m of aiModels) {
      try {
        const aiRes = await Promise.race([
          fetch(`http://127.0.0.1:58433/v1beta/models/${m}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents,
              generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
            })
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 25000))
        ]);

        if (aiRes.ok) {
          const data = await aiRes.json();
          reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (reply) break;
        }
      } catch (err) {
        console.warn(`Model ${m} tutor chat error:`, err.message);
      }
    }

    if (!reply) {
      reply = `Отличный вопрос по теме «${topicName}»! Это фундаментальное правило уровня ${topicLevel}. Обратите внимание на окончания и контекст предложения. Хотите разобрать конкретный пример?`;
    }

    res.json({ reply });
  } catch (error) {
    console.error('Error in tutor-chat:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// API: VOCABULARY FREQUENCY DECKS & CATALOGS
// ==========================================
app.get('/api/vocabulary/frequency-catalogs', (req, res) => {
  try {
    const catalogs = getFrequencyCatalogs();
    res.json({ catalogs });
  } catch (error) {
    console.error('Error fetching frequency catalogs:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vocabulary/generate-decks', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const { presetKey = 'level_a1', deckSize = 25, customPrefix = '' } = req.body || {};

    const result = generateDecksForProfile({
      db,
      profileId,
      presetKey,
      deckSize,
      customPrefix
    });

    res.json(result);
  } catch (error) {
    console.error('Error generating vocabulary decks:', error);
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// API: GAMIFICATION (XP, STREAKS, QUESTS)
// ==========================================
app.get('/api/gamification', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const status = getGamificationStatus(db, profileId);
    res.json(status);
  } catch (error) {
    console.error('Error fetching gamification status:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/gamification/add-xp', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const { amount = 10, reason = 'action' } = req.body || {};
    const status = addProfileXp(db, profileId, Number(amount) || 10, reason);
    res.json(status);
  } catch (error) {
    console.error('Error adding XP:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/gamification/quest-progress', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const { questType, increment = 1 } = req.body || {};
    const status = updateDailyQuestProgress(db, profileId, questType, Number(increment) || 1);
    res.json(status);
  } catch (error) {
    console.error('Error updating quest progress:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// API: INTERACTIVE BRANCHING STORIES
// ==========================================
app.get('/api/stories', (req, res) => {
  try {
    const profileId = getProfileId(req);
    ensureGamificationSchema(db);
    const progressRows = db.prepare('SELECT * FROM story_progress WHERE profile_id = ?').all(profileId);
    const progressMap = new Map(progressRows.map(r => [r.story_id, r]));

    const stories = PRESET_STORIES.map(s => {
      const prog = progressMap.get(s.id);
      return {
        ...s,
        progress: {
          currentChapterId: prog?.current_chapter_id || s.chapters[0]?.id,
          completedChapters: JSON.parse(prog?.completed_chapters_json || '[]'),
          isFinished: Boolean(prog?.is_finished)
        }
      };
    });

    res.json({ stories });
  } catch (error) {
    console.error('Error fetching stories:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stories/:id', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const story = PRESET_STORIES.find(s => s.id === req.params.id);
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    const prog = db.prepare('SELECT * FROM story_progress WHERE profile_id = ? AND story_id = ?').get(profileId, story.id);
    res.json({
      story,
      progress: {
        currentChapterId: prog?.current_chapter_id || story.chapters[0]?.id,
        completedChapters: JSON.parse(prog?.completed_chapters_json || '[]'),
        isFinished: Boolean(prog?.is_finished)
      }
    });
  } catch (error) {
    console.error('Error fetching story by id:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/stories/:id/progress', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const { chapterId, isFinished = false, xp = 35 } = req.body || {};
    const story = PRESET_STORIES.find(s => s.id === req.params.id);
    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    ensureGamificationSchema(db);
    let prog = db.prepare('SELECT * FROM story_progress WHERE profile_id = ? AND story_id = ?').get(profileId, story.id);
    let completed = prog ? JSON.parse(prog.completed_chapters_json || '[]') : [];
    if (chapterId && !completed.includes(chapterId)) {
      completed.push(chapterId);
    }

    db.prepare(`
      INSERT INTO story_progress (profile_id, story_id, current_chapter_id, completed_chapters_json, is_finished, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(profile_id, story_id) DO UPDATE SET
        current_chapter_id = excluded.current_chapter_id,
        completed_chapters_json = excluded.completed_chapters_json,
        is_finished = MAX(is_finished, excluded.is_finished),
        updated_at = CURRENT_TIMESTAMP
    `).run(profileId, story.id, chapterId || story.chapters[0]?.id, JSON.stringify(completed), isFinished ? 1 : 0);

    const xpGained = isFinished ? (story.xpReward || 100) : Number(xp) || 35;
    addProfileXp(db, profileId, xpGained, isFinished ? 'story_completed' : 'story_chapter');
    updateDailyQuestProgress(db, profileId, 'story', 1);

    const gamification = getGamificationStatus(db, profileId);
    res.json({ success: true, completedChapters: completed, isFinished, xpGained, gamification });
  } catch (error) {
    console.error('Error saving story progress:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// API: SITUATIONAL ROLEPLAY QUESTS
// ==========================================
app.get('/api/scenarios', (req, res) => {
  try {
    const profileId = getProfileId(req);
    ensureGamificationSchema(db);
    const rows = db.prepare('SELECT * FROM scenario_progress WHERE profile_id = ?').all(profileId);
    const map = new Map(rows.map(r => [r.scenario_id, r]));

    const scenarios = PRESET_SCENARIOS.map(s => {
      const prog = map.get(s.id);
      return {
        ...s,
        progress: {
          completedGoals: JSON.parse(prog?.completed_goals_json || '[]'),
          messagesCount: prog?.messages_count || 0,
          isCompleted: Boolean(prog?.is_completed)
        }
      };
    });

    res.json({ scenarios });
  } catch (error) {
    console.error('Error fetching scenarios:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/scenarios/:id/chat', async (req, res) => {
  const profileId = getProfileId(req);
  const { message, history = [], completedGoalIds = [] } = req.body || {};
  const scenario = PRESET_SCENARIOS.find(s => s.id === req.params.id);

  if (!scenario) {
    return res.status(404).json({ error: 'Scenario not found' });
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  ensureGamificationSchema(db);

  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  const geminiAvailable = apiKey.length > 0;

  let replyText = '';
  let newlyCompletedGoals = [];
  let feedback = null;
  let hints = scenario.suggestedHints.slice(0, 2);

  if (geminiAvailable) {
    try {
      const remainingGoals = scenario.objectives.filter(g => !completedGoalIds.includes(g.id));
      const promptInstruction = `
${scenario.systemPrompt}

SCENARIO CONTEXT: ${scenario.context}
CURRENT REMAINING GOALS FOR USER:
${remainingGoals.map(g => `- [${g.id}] ${g.label}: ${g.description}`).join('\n')}

USER MESSAGE: "${message}"

Respond strictly as JSON in the following schema:
{
  "characterReply": "Your response in natural Spanish in character with personality",
  "goalsCompletedInThisTurn": ["array of goal IDs from remaining goals that the user achieved in their message"],
  "correction": "Optional gentle linguistic correction in Russian or Spanish if user made an obvious grammatical/vocabulary error, otherwise null",
  "culturalTip": "Optional 1-sentence cultural or slang tip relevant to this dialogue in Russian, otherwise null",
  "nextSuggestedPhrases": ["1 or 2 natural Spanish phrases the user could say next"]
}
`;

      const aiModels = ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'];
      let rawAiResponse = null;

      for (const m of aiModels) {
        try {
          const resp = await fetch(`http://127.0.0.1:58433/v1beta/models/${m}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                ...history.slice(-6).map(h => ({
                  role: h.role === 'user' ? 'user' : 'model',
                  parts: [{ text: h.content }]
                })),
                { role: 'user', parts: [{ text: promptInstruction }] }
              ],
              generationConfig: {
                temperature: 0.7,
                responseMimeType: 'application/json'
              }
            })
          });

          if (resp.ok) {
            const data = await resp.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              rawAiResponse = JSON.parse(text);
              break;
            }
          }
        } catch (e) {
          console.warn(`Scenario AI attempt failed with model ${m}:`, e.message);
        }
      }

      if (rawAiResponse) {
        replyText = rawAiResponse.characterReply || '';
        newlyCompletedGoals = Array.isArray(rawAiResponse.goalsCompletedInThisTurn) ? rawAiResponse.goalsCompletedInThisTurn : [];
        if (rawAiResponse.correction || rawAiResponse.culturalTip) {
          feedback = {
            correction: rawAiResponse.correction || null,
            culturalTip: rawAiResponse.culturalTip || null
          };
        }
        if (Array.isArray(rawAiResponse.nextSuggestedPhrases) && rawAiResponse.nextSuggestedPhrases.length > 0) {
          hints = rawAiResponse.nextSuggestedPhrases;
        }
      }
    } catch (err) {
      console.error('Error calling AI in scenario chat:', err);
    }
  }

  if (!replyText) {
    replyText = `¡Muy bien, pibe! Te entiendo perfecto. Continuemos con la conversación sobre ${scenario.title}. ¿Qué más te gustaría pedir o preguntar?`;
  }

  // Update progress
  const allCompleted = Array.from(new Set([...completedGoalIds, ...newlyCompletedGoals]));
  const isScenarioCompleted = scenario.objectives.every(g => allCompleted.includes(g.id));

  let prog = db.prepare('SELECT * FROM scenario_progress WHERE profile_id = ? AND scenario_id = ?').get(profileId, scenario.id);
  const msgCount = (prog?.messages_count || 0) + 1;

  db.prepare(`
    INSERT INTO scenario_progress (profile_id, scenario_id, completed_goals_json, messages_count, is_completed, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(profile_id, scenario_id) DO UPDATE SET
      completed_goals_json = excluded.completed_goals_json,
      messages_count = excluded.messages_count,
      is_completed = MAX(is_completed, excluded.is_completed),
      updated_at = CURRENT_TIMESTAMP
  `).run(profileId, scenario.id, JSON.stringify(allCompleted), msgCount, isScenarioCompleted ? 1 : 0);

  let xpEarned = 10;
  if (newlyCompletedGoals.length > 0) {
    xpEarned += newlyCompletedGoals.length * 25;
    updateDailyQuestProgress(db, profileId, 'scenario', newlyCompletedGoals.length);
  }
  if (isScenarioCompleted && !prog?.is_completed) {
    xpEarned += 100;
  }
  addProfileXp(db, profileId, xpEarned, 'scenario_interaction');

  const gamification = getGamificationStatus(db, profileId);

  res.json({
    reply: replyText,
    completedGoalIds: allCompleted,
    newlyCompletedGoals,
    isCompleted: isScenarioCompleted,
    feedback,
    hints,
    xpEarned,
    gamification
  });
});

// ==========================================
// API: TACTILE MINI-GAMES & DRILLS
// ==========================================
app.get('/api/exercises', (req, res) => {
  try {
    const { level, category, topicId, count = 20 } = req.query;
    const allPackages = getAllA1TopicPackages();
    let selected = [];

    if (topicId) {
      const guide = getGrammarTheoryGuide(Number(topicId));
      if (guide && Array.isArray(guide.exercises)) {
        selected = guide.exercises.map((ex) => ({
          ...ex,
          topicId: guide.topicId,
          topic: guide.topicName,
          level: guide.level || 'A1',
          category: guide.category || 'Grammar',
        }));
      }
    } else {
      for (const guide of allPackages) {
        if (level && guide.level && guide.level.toLowerCase() !== String(level).toLowerCase()) {
          continue;
        }
        if (category && guide.category && guide.category.toLowerCase() !== String(category).toLowerCase()) {
          continue;
        }
        if (Array.isArray(guide.exercises)) {
          for (const ex of guide.exercises) {
            selected.push({
              ...ex,
              topicId: guide.topicId,
              topic: guide.topicName,
              level: guide.level || 'A1',
              category: guide.category || 'Grammar',
            });
          }
        }
      }
    }

    const shuffled = [...selected].sort(() => 0.5 - Math.random()).slice(0, Number(count) || 20);
    res.json(shuffled);
  } catch (error) {
    console.error('Error fetching exercises list:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/exercises/word-tiles', (req, res) => {
  try {
    const { level } = req.query;
    let items = PRESET_WORD_TILES;
    if (level) {
      items = items.filter(i => i.level.toLowerCase() === String(level).toLowerCase());
    }
    res.json({ items });
  } catch (error) {
    console.error('Error fetching word tiles:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/exercises/word-tiles/verify', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const { itemId, userSentence } = req.body || {};
    const item = PRESET_WORD_TILES.find(i => i.id === itemId);
    if (!item) {
      return res.status(404).json({ error: 'Exercise item not found' });
    }

    const clean = str => (str || '').toLowerCase().replace(/[¿?¡!.,;:«»"']/g, '').replace(/\s+/g, ' ').trim();
    const isCorrect = clean(userSentence) === clean(item.correctSentence);

    let xpGained = 0;
    if (isCorrect) {
      xpGained = 20;
      addProfileXp(db, profileId, xpGained, 'word_tiles_success');
    }

    const gamification = getGamificationStatus(db, profileId);
    res.json({ isCorrect, correctSentence: item.correctSentence, xpGained, gamification });
  } catch (error) {
    console.error('Error verifying word tiles:', error);
    res.status(500).json({ error: error.message });
  }
});

function cleanSpeedMatchText(txt) {
  if (!txt) return '';
  return txt
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .split(';')[0]
    .split(',')[0]
    .split('/')[0]
    .trim();
}

function getSpeedMatchPairs(db, profileId, count = 6) {
  const chosenMap = new Map();

  try {
    // 1. Pick 2 Favorite words
    const favRows = db.prepare(`
      SELECT word, translation
      FROM vocabulary
      WHERE profile_id = ? AND is_favorite = 1 AND translation IS NOT NULL AND length(trim(translation)) > 0
      ORDER BY random() LIMIT 10
    `).all(profileId);

    for (const r of favRows) {
      const es = cleanSpeedMatchText(r.word);
      const ru = cleanSpeedMatchText(r.translation);
      if (es && ru && es.length <= 25 && ru.length <= 25 && !chosenMap.has(es)) {
        chosenMap.set(es, { es, ru, tag: '⭐' });
      }
      if (chosenMap.size >= 2) break;
    }

    // 2. Pick 2 Learned / Mastered words
    const learnedRows = db.prepare(`
      SELECT DISTINCT v.word, v.translation
      FROM vocabulary v
      LEFT JOIN vocabulary_review_cards c ON c.vocabulary_id = v.id
      WHERE v.profile_id = ? AND (v.learned_permanently_at IS NOT NULL OR c.learned_until IS NOT NULL OR c.review_count >= 3) AND v.translation IS NOT NULL AND length(trim(v.translation)) > 0
      ORDER BY random() LIMIT 10
    `).all(profileId);

    for (const r of learnedRows) {
      const es = cleanSpeedMatchText(r.word);
      const ru = cleanSpeedMatchText(r.translation);
      if (es && ru && es.length <= 25 && ru.length <= 25 && !chosenMap.has(es)) {
        chosenMap.set(es, { es, ru, tag: '✓' });
      }
      if (chosenMap.size >= 4) break;
    }

    // 3. Pick 2 Currently In-Progress / Due words
    const dueRows = db.prepare(`
      SELECT DISTINCT v.word, v.translation
      FROM vocabulary v
      LEFT JOIN vocabulary_review_cards c ON c.vocabulary_id = v.id
      WHERE v.profile_id = ? AND (v.learned_permanently_at IS NULL) AND v.translation IS NOT NULL AND length(trim(v.translation)) > 0
      ORDER BY random() LIMIT 15
    `).all(profileId);

    for (const r of dueRows) {
      const es = cleanSpeedMatchText(r.word);
      const ru = cleanSpeedMatchText(r.translation);
      if (es && ru && es.length <= 25 && ru.length <= 25 && !chosenMap.has(es)) {
        chosenMap.set(es, { es, ru, tag: '📖' });
      }
      if (chosenMap.size >= count) break;
    }
  } catch (e) {
    console.error('Error selecting user words for speed match:', e);
  }

  // 4. Fallback from preset curated list if user doesn't have enough words
  if (chosenMap.size < count) {
    const shuffledPreset = [...SPEED_MATCH_PAIRS].sort(() => 0.5 - Math.random());
    for (const p of shuffledPreset) {
      if (!chosenMap.has(p.es)) {
        chosenMap.set(p.es, { es: p.es, ru: p.ru, tag: '⚡' });
      }
      if (chosenMap.size >= count) break;
    }
  }

  return Array.from(chosenMap.values()).sort(() => 0.5 - Math.random());
}

app.get('/api/exercises/speed-match', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const pairs = getSpeedMatchPairs(db, profileId, 6);
    res.json({ pairs });
  } catch (error) {
    console.error('Error fetching speed match:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/exercises/speed-match/finish', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const { matchedCount = 6, secondsSpent = 25, combo = 1 } = req.body || {};

    const xpBase = Math.min(100, Math.max(10, Math.round(matchedCount * 6 + combo * 4)));
    addProfileXp(db, profileId, xpBase, 'speed_match_blitz');
    updateDailyQuestProgress(db, profileId, 'speed_match', 1);

    const gamification = getGamificationStatus(db, profileId);
    res.json({ success: true, xpGained: xpBase, gamification });
  } catch (error) {
    console.error('Error finishing speed match:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/exercises/error-detective', (req, res) => {
  try {
    const { level } = req.query;
    let items = PRESET_ERROR_DETECTIVES;
    if (level) {
      items = items.filter(i => i.level.toLowerCase() === String(level).toLowerCase());
    }
    res.json({ items });
  } catch (error) {
    console.error('Error fetching error detective:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/exercises/error-detective/verify', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const { itemId, selectedWord, selectedFix } = req.body || {};
    const item = PRESET_ERROR_DETECTIVES.find(i => i.id === itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const isCorrect = (selectedFix === item.correctWord) || (selectedWord && item.errorWord.includes(selectedWord) && selectedFix === item.correctWord);
    let xpGained = 0;
    if (isCorrect) {
      xpGained = 25;
      addProfileXp(db, profileId, xpGained, 'error_detective_success');
    }

    const gamification = getGamificationStatus(db, profileId);
    res.json({
      isCorrect,
      correctWord: item.correctWord,
      ruleExplanation: item.ruleExplanation,
      xpGained,
      gamification
    });
  } catch (error) {
    console.error('Error verifying error detective:', error);
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// API: TODAY'S RECOMMENDATIONS (SMART COACH)
// ==========================================
app.get('/api/recommendations/today', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const lang = req.query.lang || req.headers['x-ui-lang'] || 'ru';
    const result = getTodayRecommendations(db, profileId, lang);
    res.json(result);
  } catch (error) {
    console.error('Error fetching today recommendations:', error);
    res.status(500).json({ error: error.message });
  }
});

app.use(express.static(join(__dirname, '../public')));
app.use(express.static(join(__dirname, '../dist')));

function startServer(port = PORT) {
  return app.listen(port, () => {
    console.log(`🇪🇸 Spanish Learning Server running on http://localhost:${port}`);
  });
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  startServer();
}

export { app, db, startServer };


// ==========================================
// API: SANDWICH IMMERSION OVERARCHING STORY
// ==========================================
app.get('/api/sandwich-story', (req, res) => {
  try {
    const profileId = getProfileId(req);
    let completedChapterIds = [];
    try {
      const row = db.prepare('SELECT completed_chapters_json FROM story_progress WHERE profile_id = ? AND story_id = ?').get(profileId, MATEO_A1_STORY.id);
      if (row) {
        completedChapterIds = JSON.parse(row.completed_chapters_json || '[]');
      }
    } catch (e) {
      console.error('Error fetching sandwich story progress:', e);
    }

    res.json({
      story: MATEO_A1_STORY,
      completedChapterIds
    });
  } catch (error) {
    console.error('Error fetching sandwich story:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sandwich-story/progress', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const { chapterId } = req.body || {};
    if (!chapterId) {
      return res.status(400).json({ error: 'Chapter ID required' });
    }

    let completedChapterIds = [];
    const row = db.prepare('SELECT completed_chapters_json FROM story_progress WHERE profile_id = ? AND story_id = ?').get(profileId, MATEO_A1_STORY.id);
    if (row) {
      completedChapterIds = JSON.parse(row.completed_chapters_json || '[]');
    }

    if (!completedChapterIds.includes(chapterId)) {
      completedChapterIds.push(chapterId);
      db.prepare(`
        INSERT INTO story_progress (profile_id, story_id, current_chapter_id, completed_chapters_json, is_finished, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(profile_id, story_id) DO UPDATE SET
          completed_chapters_json = excluded.completed_chapters_json,
          is_finished = CASE WHEN ? >= ? THEN 1 ELSE 0 END,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        profileId,
        MATEO_A1_STORY.id,
        chapterId,
        JSON.stringify(completedChapterIds),
        completedChapterIds.length,
        MATEO_A1_STORY.chapters.length
      );

      // Award XP
      addProfileXp(db, profileId, 50, "sandwich_story_chapter");
    }

    res.json({ success: true, completedChapterIds });
  } catch (error) {
    console.error('Error saving sandwich story progress:', error);
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/gamification/record-practice', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const { type = 'vocab_review', count = 1 } = req.body || {};
    const status = updateDailyQuestProgress(db, profileId, type, count);
    addProfileXp(db, profileId, 3 * count, type);
    res.json(status);
  } catch (error) {
    console.error('Error recording practice gamification:', error);
    res.status(500).json({ error: error.message });
  }
});
