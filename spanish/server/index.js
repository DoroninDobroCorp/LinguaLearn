import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = Number.parseInt(process.env.PORT || '3003', 10);
const SERVICE_NAME = 'spanish-api';

// Инициализация Gemini
const geminiApiKey = String(process.env.GEMINI_API_KEY || '').trim();
const geminiEnabled = geminiApiKey.length > 0;
const genAI = geminiEnabled ? new GoogleGenerativeAI(geminiApiKey) : null;

if (!geminiEnabled) {
  console.warn(
    '⚠️ GEMINI_API_KEY not found. Core API will stay online, but AI chat endpoints will return 503 until Gemini is configured.'
  );
}

// Инициализация базы данных
const db = new Database(join(__dirname, 'spanish_learning.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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

// Ensure default profile exists
if (!db.prepare('SELECT id FROM profiles WHERE id = 1').get()) {
  db.exec("INSERT INTO profiles (id, name, avatar_emoji) VALUES (1, 'Default', '👤')");
}

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
  { name: 'Subject pronouns (yo/tú/él/ella)', category: 'Grammar', level: 'A1' },
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

app.use(cors());
app.use(express.json());

// ==================== PROFILE HELPERS ====================

function getProfileId(req) {
  const id = parseInt(req.query.profileId, 10);
  if (Number.isFinite(id) && id > 0) {
    const exists = db.prepare('SELECT 1 FROM profiles WHERE id = ?').get(id);
    if (exists) return id;
  }
  return 1;
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
  const curriculumNames = db.prepare(
    'SELECT name, level, category FROM curriculum_topics ORDER BY level, category'
  ).all();
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

// API: Чат с ЛЛМ
app.post('/api/chat', async (req, res) => {
  if (!ensureGeminiAvailable(res, ['aiChat'])) {
    return;
  }

  const profileId = getProfileId(req);

  try {
    const { message } = req.body;
    
    // Сохранение сообщения пользователя
    db.prepare('INSERT INTO chat_history (role, content, profile_id) VALUES (?, ?, ?)').run('user', message, profileId);
    
    // Получение истории чата (последние 10 сообщений)
    const history = db.prepare('SELECT role, content FROM chat_history WHERE profile_id = ? ORDER BY id DESC LIMIT 10').all(profileId).reverse();
    
    const systemPrompt = `You are a friendly and professional Spanish language tutor. Your tasks:
1. Help the user learn Spanish through natural dialogue IN SPANISH ONLY
2. Give varied learning activities: casual chat, exercises, recommendations
3. Track mistakes and successes
4. After each user's answer to a task, evaluate it and report the result

${getTopicsContext(profileId)}

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
¡Vamos a practicar el pretérito! Aquí tienes un ejercicio rápido:
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
Example: User says "Si hubiera tenido más tiempo, habría viajado a España."
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
Response: "¡No te preocupes! Un par de cositas:
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
    
    // Парсинг обновлений тем
    const topicChanges = [];
    
    // Extract JSON by finding balanced braces
    const tagIndex = responseText.indexOf('[TOPICS_UPDATE: ');
    if (tagIndex !== -1) {
      const jsonStart = tagIndex + '[TOPICS_UPDATE: '.length;
      let braceCount = 0;
      let jsonEnd = -1;
      
      for (let i = jsonStart; i < responseText.length; i++) {
        if (responseText[i] === '{') braceCount++;
        else if (responseText[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
      
      if (jsonEnd !== -1) {
        const jsonStr = responseText.substring(jsonStart, jsonEnd);
        
        try {
          const updates = JSON.parse(jsonStr);
          if (updates.updates) {
            for (const update of updates.updates) {
              const result = updateTopic(update.topic, update.category, update.level, update.success, profileId);
              if (result) {
                topicChanges.push(result);
              }
            }
          }
        } catch (e) {
          console.error('Error parsing topic updates:', e);
          console.error('Failed to parse:', jsonStr);
        }
      }
    }
    
    // Парсинг добавления слов в словарь
    const vocabMatch = responseText.match(/\[VOCAB_ADD: ({.*?})\]/s);
    if (vocabMatch) {
      try {
        const vocab = JSON.parse(vocabMatch[1]);
        // Проверка на существование
        const existing = db.prepare('SELECT id FROM vocabulary WHERE word = ? AND profile_id = ?').get(vocab.word, profileId);
        if (!existing) {
          db.prepare(`
            INSERT INTO vocabulary (word, translation, example, level, next_review, profile_id)
            VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP, ?)
          `).run(vocab.word, vocab.translation, vocab.example || null, profileId);
        }
      } catch (e) {
        console.error('Error parsing vocab add:', e);
      }
    }
    
    // Remove metadata tags using balanced-brace extraction (handles nested JSON)
    function stripBalancedTag(text, tagPrefix) {
      let result = text;
      let idx;
      while ((idx = result.indexOf(tagPrefix)) !== -1) {
        const jsonStart = idx + tagPrefix.length;
        let braceCount = 0;
        let jsonEnd = -1;
        for (let i = jsonStart; i < result.length; i++) {
          if (result[i] === '{') braceCount++;
          else if (result[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
              jsonEnd = i + 1;
              break;
            }
          }
        }
        if (jsonEnd === -1) break;
        // Skip past the closing ']'
        let tagEnd = jsonEnd;
        while (tagEnd < result.length && result[tagEnd] !== ']') tagEnd++;
        if (tagEnd < result.length) tagEnd++; // include the ']'
        result = result.slice(0, idx) + result.slice(tagEnd);
      }
      return result;
    }

    const cleanResponse = stripBalancedTag(
      stripBalancedTag(responseText, '[TOPICS_UPDATE: '),
      '[VOCAB_ADD: '
    ).trim();
    
    // Сохранение ответа ассистента
    db.prepare('INSERT INTO chat_history (role, content, profile_id) VALUES (?, ?, ?)').run('assistant', cleanResponse, profileId);
    
    res.json({ 
      response: cleanResponse,
      topicChanges: topicChanges.length > 0 ? topicChanges : undefined
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Функция обновления темы — writes progress to curriculum_progress
function updateTopic(name, category, level, success, profileId) {
  // Try exact match in curriculum_topics first
  let existing = db.prepare(
    'SELECT * FROM curriculum_topics WHERE LOWER(name) = LOWER(?)'
  ).get(name);

  // Fuzzy match if no exact match
  if (!existing) {
    existing = db.prepare(
      `SELECT * FROM curriculum_topics 
       WHERE LOWER(?) LIKE '%' || LOWER(name) || '%' 
       OR LOWER(name) LIKE '%' || LOWER(?) || '%'
       LIMIT 1`
    ).get(name, name);
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
    const result = db.prepare(`
      INSERT INTO curriculum_topics (name, category, level, source)
      VALUES (?, ?, ?, 'ai_detected')
    `).run(name, category, level);

    const topicId = result.lastInsertRowid;
    const initialScore = success ? 50 : 0;

    // Create progress for this profile
    db.prepare(`
      INSERT INTO curriculum_progress (topic_id, profile_id, status, score, success_count, failure_count, last_practiced)
      VALUES (?, ?, 'in_progress', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(topicId, profileId, initialScore, success ? 1 : 0, success ? 0 : 1);

    return { 
      isNew: true, 
      name, 
      category,
      level,
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
             cp.status, cp.score, cp.success_count, cp.failure_count, cp.last_practiced
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

// API: Ручное обновление темы
app.post('/api/topics/update', (req, res) => {
  const profileId = getProfileId(req);
  const { topic, category, level, success } = req.body;
  updateTopic(topic, category, level, success, profileId);
  res.json({ success: true });
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

// ==================== VOCABULARY API ====================

// Получение всех слов
app.get('/api/vocabulary', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const words = db.prepare('SELECT * FROM vocabulary WHERE profile_id = ? ORDER BY next_review ASC').all(profileId);
    res.json({ words });
  } catch (error) {
    console.error('Error fetching vocabulary:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получение слов на повторение сегодня
app.get('/api/vocabulary/due', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const today = new Date().toISOString().split('T')[0];
    const words = db.prepare(
      'SELECT * FROM vocabulary WHERE profile_id = ? AND next_review <= ? ORDER BY next_review ASC'
    ).all(profileId, today + 'T23:59:59');
    res.json({ words });
  } catch (error) {
    console.error('Error fetching due words:', error);
    res.status(500).json({ error: error.message });
  }
});

// Добавление нового слова
app.post('/api/vocabulary', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const { word, translation, example } = req.body;
    
    const existing = db.prepare('SELECT id FROM vocabulary WHERE word = ? AND profile_id = ?').get(word, profileId);
    if (existing) {
      return res.status(400).json({ error: 'Word already exists' });
    }
    
    const result = db.prepare(`
      INSERT INTO vocabulary (word, translation, example, level, next_review, profile_id)
      VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP, ?)
    `).run(word, translation, example || null, profileId);
    
    const newWord = db.prepare('SELECT * FROM vocabulary WHERE id = ?').get(result.lastInsertRowid);
    res.json(newWord);
  } catch (error) {
    console.error('Error adding word:', error);
    res.status(500).json({ error: error.message });
  }
});

// Обновление прогресса слова (после повторения)
app.post('/api/vocabulary/:id/review', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const { id } = req.params;
    const { quality, nextReview, interval } = req.body;
    
    const word = db.prepare('SELECT * FROM vocabulary WHERE id = ? AND profile_id = ?').get(id, profileId);
    if (!word) {
      return res.status(404).json({ error: 'Word not found' });
    }
    
    let newLevel = word.level;
    
    if (quality === 0) {
      newLevel = 0;
    } else if (quality === 1) {
      newLevel = Math.max(0, Math.min(5, word.level + 0.5));
    } else if (quality === 2) {
      newLevel = Math.min(5, word.level + 1);
    } else if (quality === 3) {
      newLevel = Math.min(5, word.level + 2);
    }
    
    db.prepare(`
      UPDATE vocabulary 
      SET level = ?,
          next_review = ?,
          review_count = review_count + 1,
          last_reviewed = CURRENT_TIMESTAMP
      WHERE id = ? AND profile_id = ?
    `).run(newLevel, nextReview, id, profileId);
    
    const updatedWord = db.prepare('SELECT * FROM vocabulary WHERE id = ?').get(id);
    res.json(updatedWord);
  } catch (error) {
    console.error('Error reviewing word:', error);
    res.status(500).json({ error: error.message });
  }
});

// Удаление слова
app.delete('/api/vocabulary/:id', (req, res) => {
  try {
    const profileId = getProfileId(req);
    db.prepare('DELETE FROM vocabulary WHERE id = ? AND profile_id = ?').run(req.params.id, profileId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting word:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== CURRICULUM API ====================

// Get all curriculum topics with per-profile progress
app.get('/api/curriculum', (req, res) => {
  try {
    const profileId = getProfileId(req);
    const settings = getProfileSettings(profileId);
    const topics = db.prepare(`
      SELECT ct.id, ct.name, ct.category, ct.level, ct.source, ct.created_at,
             COALESCE(cp.status, 'not_started') as status,
             COALESCE(cp.score, 0) as score,
             COALESCE(cp.success_count, 0) as success_count,
             COALESCE(cp.failure_count, 0) as failure_count,
             cp.last_practiced
      FROM curriculum_topics ct
      LEFT JOIN curriculum_progress cp ON cp.topic_id = ct.id AND cp.profile_id = ?
      ORDER BY ct.level, ct.category, ct.name
    `).all(profileId);
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
    
    const vocabTotal = db.prepare('SELECT COUNT(*) as count FROM vocabulary WHERE profile_id = ?').get(profileId).count;
    const today = new Date().toISOString().split('T')[0];
    const vocabDue = db.prepare(
      'SELECT COUNT(*) as count FROM vocabulary WHERE profile_id = ? AND next_review <= ?'
    ).get(profileId, today + 'T23:59:59').count;
    const vocabMastered = db.prepare(
      'SELECT COUNT(*) as count FROM vocabulary WHERE profile_id = ? AND review_count >= 5 AND level >= 2'
    ).get(profileId).count;
    
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

// ==================== PROFILES API ====================

app.get('/api/profiles', (req, res) => {
  try {
    const profiles = db.prepare('SELECT * FROM profiles ORDER BY id').all();
    res.json({ profiles });
  } catch (error) {
    console.error('Error fetching profiles:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/profiles', (req, res) => {
  try {
    const { name, avatarEmoji } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Profile name is required' });
    }

    const result = db.prepare(
      'INSERT INTO profiles (name, avatar_emoji) VALUES (?, ?)'
    ).run(name.trim(), avatarEmoji || '👤');

    const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(result.lastInsertRowid);

    // Initialize settings for new profile
    db.prepare('INSERT INTO user_settings (profile_id, max_level) VALUES (?, ?)').run(profile.id, 'B2');

    res.json(profile);
  } catch (error) {
    console.error('Error creating profile:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/profiles/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (id === 1) {
      return res.status(400).json({ error: 'Cannot delete the default profile' });
    }

    const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Cascade delete all profile data atomically
    const deleteProfile = db.transaction((profileId) => {
      db.prepare('DELETE FROM chat_history WHERE profile_id = ?').run(profileId);
      db.prepare('DELETE FROM vocabulary WHERE profile_id = ?').run(profileId);
      db.prepare('DELETE FROM curriculum_progress WHERE profile_id = ?').run(profileId);
      db.prepare('DELETE FROM user_settings WHERE profile_id = ?').run(profileId);
      db.prepare('DELETE FROM profiles WHERE id = ?').run(profileId);
    });
    deleteProfile(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting profile:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🇪🇸 Spanish Learning Server running on http://localhost:${PORT}`);
});
