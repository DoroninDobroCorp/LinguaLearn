import { generateEnglishExercise } from './grammarExerciseEngine.js';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { execSync } from 'child_process';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Database from 'better-sqlite3';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { basename, dirname, join, resolve, sep } from 'path';
import { buildHpmorChapterImport } from './hpmor.js';
import { transcribeAudioLocally } from './localAudioTranscription.js';
import { translateSegmentsWithGemini } from './geminiSegmentTranslation.js';
import { attachLiveChatBridge } from './liveChatBridge.js';
import {
  createCaptureAuthMiddleware,
  createGeminiWritingAnalyzer,
  createWritingAnalysisService,
  createWritingAnalyzeHandler,
  createWritingSamplesHandler,
  createWritingFeedbackHandler,
} from './writingAnalysis.js';
import {
  createChatIdempotencyStore,
  normalizeGeminiChatHistory,
  normalizeOptionalMessageId,
} from './chatIdempotency.js';
import { getDb, getDatabasePath, initAuthTables } from './db.js';
import { parseCookies } from './auth.js';
import { getOwnerId } from './dbMigration.js';
import { createAuthService, createAuthMiddleware } from './auth.js';
import { createDeviceTokenService, createDeviceAuthMiddleware } from './deviceTokens.js';
import { createDailyPracticeService } from './dailyPractice.js';
import { logAnalyticsEvent, getSystemMetrics } from './analytics.js';
import {
  calculateTopicStatus,
  calculateMasteryConfidence,
  recordTopicEvidence,
  recalculateTopicProgress,
  getUserTopicProgress,
} from './topicProgress.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = Number.parseInt(process.env.PORT || '3001', 10);
const HOST = String(process.env.HOST || '127.0.0.1').trim();
const SERVICE_NAME = 'english-api';
const hpmorChapterHtmlCache = new Map();
const hpmorPodcastPostHtmlCache = new Map();
let hpmorPodcastHtmlCache = null;

// Инициализация Gemini
const geminiApiKey = String(process.env.GEMINI_API_KEY || '').trim();
const geminiEnabled = geminiApiKey.length > 0;
const genAI = geminiEnabled ? new GoogleGenerativeAI(geminiApiKey) : null;
const geminiChatModel = String(
  process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash-lite'
).trim();

if (!geminiEnabled) {
  console.warn(
    '⚠️ GEMINI_API_KEY not found. Core API will stay online, but AI chat and reader translation endpoints will return 503 until Gemini is configured.'
  );
}

// Инициализация базы данных
const configuredDatabasePath = String(process.env.ENGLISH_DB_PATH || '').trim();
const db = getDb(configuredDatabasePath);
const databasePath = getDatabasePath(configuredDatabasePath);

function getUserId(req) {
  if (req && req.user && req.user.id) return req.user.id;
  if (req && req.userId) return req.userId;
  const cookies = parseCookies(req?.headers?.cookie);
  if (cookies && cookies.lingua_session) {
    const session = db.prepare('SELECT user_id FROM sessions WHERE id = ?').get(cookies.lingua_session);
    if (session) return session.user_id;
  }
  return null;
}

// Инициализация настроек пользователя
// User settings initialized via getDb

// ==================== CEFR CURRICULUM DATA ====================
const CURRICULUM_DATA = [
  // ===== A1 - Beginner =====
  // Grammar
  { name: 'Verb "to be" (am/is/are)', category: 'Grammar', level: 'A1' },
  { name: 'Present Simple (positive)', category: 'Grammar', level: 'A1' },
  { name: 'Present Simple (negative & questions)', category: 'Grammar', level: 'A1' },
  { name: 'Articles (a/an/the)', category: 'Grammar', level: 'A1' },
  { name: 'Plural nouns (-s/-es)', category: 'Grammar', level: 'A1' },
  { name: 'Subject pronouns (I/you/he/she)', category: 'Grammar', level: 'A1' },
  { name: 'Possessive adjectives (my/your/his)', category: 'Grammar', level: 'A1' },
  { name: 'Demonstratives (this/that/these/those)', category: 'Grammar', level: 'A1' },
  { name: 'There is / There are', category: 'Grammar', level: 'A1' },
  { name: 'Imperatives (sit down, open)', category: 'Grammar', level: 'A1' },
  { name: 'Can / Can\'t (ability)', category: 'Grammar', level: 'A1' },
  { name: 'Prepositions of place (in/on/at)', category: 'Grammar', level: 'A1' },
  { name: 'Prepositions of time (in/on/at)', category: 'Grammar', level: 'A1' },
  { name: 'Countable & uncountable nouns', category: 'Grammar', level: 'A1' },
  { name: 'How much / How many', category: 'Grammar', level: 'A1' },
  { name: 'Present Continuous (basic)', category: 'Grammar', level: 'A1' },
  { name: 'Object pronouns (me/you/him/her)', category: 'Grammar', level: 'A1' },
  { name: 'Adjective order (basic)', category: 'Grammar', level: 'A1' },
  // Vocabulary themes
  { name: 'Numbers and counting', category: 'Vocabulary', level: 'A1' },
  { name: 'Colors', category: 'Vocabulary', level: 'A1' },
  { name: 'Family members', category: 'Vocabulary', level: 'A1' },
  { name: 'Days, months, seasons', category: 'Vocabulary', level: 'A1' },
  { name: 'Basic food and drinks', category: 'Vocabulary', level: 'A1' },
  { name: 'Clothes (basic)', category: 'Vocabulary', level: 'A1' },
  { name: 'Parts of the body', category: 'Vocabulary', level: 'A1' },
  { name: 'Rooms and furniture', category: 'Vocabulary', level: 'A1' },
  // Functions
  { name: 'Greetings and introductions', category: 'Speaking', level: 'A1' },
  { name: 'Asking and telling the time', category: 'Speaking', level: 'A1' },
  { name: 'Ordering food (basic)', category: 'Speaking', level: 'A1' },
  { name: 'Describing people (basic)', category: 'Speaking', level: 'A1' },

  // ===== A2 - Elementary =====
  // Grammar
  { name: 'Past Simple (regular verbs)', category: 'Grammar', level: 'A2' },
  { name: 'Past Simple (irregular verbs)', category: 'Grammar', level: 'A2' },
  { name: 'Past Simple (negative & questions)', category: 'Grammar', level: 'A2' },
  { name: 'Future with "going to"', category: 'Grammar', level: 'A2' },
  { name: 'Future with "will" (basic)', category: 'Grammar', level: 'A2' },
  { name: 'Present Continuous (future plans)', category: 'Grammar', level: 'A2' },
  { name: 'Comparative adjectives (-er/more)', category: 'Grammar', level: 'A2' },
  { name: 'Superlative adjectives (-est/most)', category: 'Grammar', level: 'A2' },
  { name: 'Adverbs of frequency (always/never)', category: 'Grammar', level: 'A2' },
  { name: 'Some / Any / No', category: 'Grammar', level: 'A2' },
  { name: 'Much / Many / A lot of', category: 'Grammar', level: 'A2' },
  { name: 'Have to / Don\'t have to', category: 'Grammar', level: 'A2' },
  { name: 'Should / Shouldn\'t', category: 'Grammar', level: 'A2' },
  { name: 'Possessive pronouns (mine/yours)', category: 'Grammar', level: 'A2' },
  { name: 'Past Continuous (basic)', category: 'Grammar', level: 'A2' },
  { name: 'Conjunctions (and/but/or/because)', category: 'Grammar', level: 'A2' },
  { name: 'Question words (who/what/where/when/why/how)', category: 'Grammar', level: 'A2' },
  { name: 'Infinitive of purpose (to + verb)', category: 'Grammar', level: 'A2' },
  // Vocabulary themes
  { name: 'Travel and transport', category: 'Vocabulary', level: 'A2' },
  { name: 'Weather', category: 'Vocabulary', level: 'A2' },
  { name: 'Hobbies and leisure', category: 'Vocabulary', level: 'A2' },
  { name: 'Jobs and occupations', category: 'Vocabulary', level: 'A2' },
  { name: 'Shopping', category: 'Vocabulary', level: 'A2' },
  { name: 'Health and the body', category: 'Vocabulary', level: 'A2' },
  { name: 'Daily routines', category: 'Vocabulary', level: 'A2' },
  // Functions
  { name: 'Asking for and giving directions', category: 'Speaking', level: 'A2' },
  { name: 'Making suggestions (Let\'s / How about)', category: 'Speaking', level: 'A2' },
  { name: 'Describing past events', category: 'Speaking', level: 'A2' },
  { name: 'Making plans and arrangements', category: 'Speaking', level: 'A2' },
  { name: 'Expressing likes and dislikes', category: 'Speaking', level: 'A2' },

  // ===== B1 - Intermediate =====
  // Grammar
  { name: 'Present Perfect (experience)', category: 'Grammar', level: 'B1' },
  { name: 'Present Perfect vs Past Simple', category: 'Grammar', level: 'B1' },
  { name: 'Present Perfect Continuous', category: 'Grammar', level: 'B1' },
  { name: 'Past Continuous vs Past Simple', category: 'Grammar', level: 'B1' },
  { name: 'Used to / Would (past habits)', category: 'Grammar', level: 'B1' },
  { name: 'First Conditional (if + will)', category: 'Grammar', level: 'B1' },
  { name: 'Second Conditional (if + would)', category: 'Grammar', level: 'B1' },
  { name: 'Passive voice (present & past)', category: 'Grammar', level: 'B1' },
  { name: 'Relative clauses (who/which/that)', category: 'Grammar', level: 'B1' },
  { name: 'Reported speech (basic)', category: 'Grammar', level: 'B1' },
  { name: 'Gerund vs Infinitive', category: 'Grammar', level: 'B1' },
  { name: 'Modal verbs (must/might/may)', category: 'Grammar', level: 'B1' },
  { name: 'Too / Enough', category: 'Grammar', level: 'B1' },
  { name: 'So / Such', category: 'Grammar', level: 'B1' },
  { name: 'Definite article (the) — advanced uses', category: 'Grammar', level: 'B1' },
  { name: 'Quantifiers (a few / a little / plenty of)', category: 'Grammar', level: 'B1' },
  { name: 'Linking words (however/although/despite)', category: 'Grammar', level: 'B1' },
  { name: 'Tag questions', category: 'Grammar', level: 'B1' },
  // Vocabulary themes
  { name: 'Education and studying', category: 'Vocabulary', level: 'B1' },
  { name: 'Technology and the internet', category: 'Vocabulary', level: 'B1' },
  { name: 'Environment and nature', category: 'Vocabulary', level: 'B1' },
  { name: 'Feelings and emotions', category: 'Vocabulary', level: 'B1' },
  { name: 'Crime and law', category: 'Vocabulary', level: 'B1' },
  { name: 'Money and finance (basic)', category: 'Vocabulary', level: 'B1' },
  // Functions
  { name: 'Expressing opinions (I think/believe)', category: 'Speaking', level: 'B1' },
  { name: 'Agreeing and disagreeing', category: 'Speaking', level: 'B1' },
  { name: 'Making complaints', category: 'Speaking', level: 'B1' },
  { name: 'Telling a story / anecdote', category: 'Speaking', level: 'B1' },
  { name: 'Giving advice', category: 'Speaking', level: 'B1' },

  // ===== B2 - Upper-Intermediate =====
  // Grammar
  { name: 'Third Conditional (if + would have)', category: 'Grammar', level: 'B2' },
  { name: 'Mixed Conditionals', category: 'Grammar', level: 'B2' },
  { name: 'Wish / If only', category: 'Grammar', level: 'B2' },
  { name: 'Past Perfect', category: 'Grammar', level: 'B2' },
  { name: 'Past Perfect Continuous', category: 'Grammar', level: 'B2' },
  { name: 'Future Continuous', category: 'Grammar', level: 'B2' },
  { name: 'Future Perfect', category: 'Grammar', level: 'B2' },
  { name: 'Passive voice (all tenses)', category: 'Grammar', level: 'B2' },
  { name: 'Reported speech (advanced)', category: 'Grammar', level: 'B2' },
  { name: 'Relative clauses (non-defining)', category: 'Grammar', level: 'B2' },
  { name: 'Causative (have/get something done)', category: 'Grammar', level: 'B2' },
  { name: 'Inversion (negative adverbials)', category: 'Grammar', level: 'B2' },
  { name: 'Participle clauses', category: 'Grammar', level: 'B2' },
  { name: 'Modals of deduction (must/can\'t/might have)', category: 'Grammar', level: 'B2' },
  { name: 'Articles — zero article', category: 'Grammar', level: 'B2' },
  { name: 'Emphasis (cleft sentences: It is... / What I...)', category: 'Grammar', level: 'B2' },
  // Vocabulary themes
  { name: 'Work and career', category: 'Vocabulary', level: 'B2' },
  { name: 'Media and news', category: 'Vocabulary', level: 'B2' },
  { name: 'Relationships and society', category: 'Vocabulary', level: 'B2' },
  { name: 'Science and research', category: 'Vocabulary', level: 'B2' },
  { name: 'Phrasal verbs (common)', category: 'Vocabulary', level: 'B2' },
  { name: 'Collocations (make/do/take/get)', category: 'Vocabulary', level: 'B2' },
  { name: 'Idioms (common)', category: 'Vocabulary', level: 'B2' },
  // Functions
  { name: 'Debating and persuading', category: 'Speaking', level: 'B2' },
  { name: 'Speculating about the future', category: 'Speaking', level: 'B2' },
  { name: 'Describing trends and data', category: 'Speaking', level: 'B2' },
  { name: 'Formal vs informal register', category: 'Speaking', level: 'B2' },
  { name: 'Expressing hypothetical situations', category: 'Speaking', level: 'B2' },

  // ===== C1 - Advanced =====
  // Grammar
  { name: 'Advanced inversion', category: 'Grammar', level: 'C1' },
  { name: 'Subjunctive mood', category: 'Grammar', level: 'C1' },
  { name: 'Ellipsis and substitution', category: 'Grammar', level: 'C1' },
  { name: 'Fronting and cleft sentences', category: 'Grammar', level: 'C1' },
  { name: 'Nominal clauses', category: 'Grammar', level: 'C1' },
  { name: 'Advanced passive constructions', category: 'Grammar', level: 'C1' },
  { name: 'Mixed conditionals (advanced)', category: 'Grammar', level: 'C1' },
  { name: 'Discourse markers (actually/in fact/as a matter of fact)', category: 'Grammar', level: 'C1' },
  { name: 'Complex noun phrases', category: 'Grammar', level: 'C1' },
  { name: 'Hedging and vague language', category: 'Grammar', level: 'C1' },
  // Vocabulary themes
  { name: 'Abstract concepts', category: 'Vocabulary', level: 'C1' },
  { name: 'Academic vocabulary', category: 'Vocabulary', level: 'C1' },
  { name: 'Advanced phrasal verbs', category: 'Vocabulary', level: 'C1' },
  { name: 'Formal and informal registers', category: 'Vocabulary', level: 'C1' },
  { name: 'Word formation (prefixes/suffixes)', category: 'Vocabulary', level: 'C1' },
  { name: 'Business English', category: 'Vocabulary', level: 'C1' },
  // Functions
  { name: 'Nuanced opinion expression', category: 'Speaking', level: 'C1' },
  { name: 'Academic presentations', category: 'Speaking', level: 'C1' },
  { name: 'Negotiation language', category: 'Speaking', level: 'C1' },
  { name: 'Expressing irony and sarcasm', category: 'Speaking', level: 'C1' },

  // ===== C2 - Mastery =====
  // Grammar
  { name: 'Stylistic inversion', category: 'Grammar', level: 'C2' },
  { name: 'Advanced subjunctive', category: 'Grammar', level: 'C2' },
  { name: 'Archaic and literary grammar', category: 'Grammar', level: 'C2' },
  { name: 'Complex sentence patterns', category: 'Grammar', level: 'C2' },
  { name: 'Pragmatics and implicature', category: 'Grammar', level: 'C2' },
  // Vocabulary themes
  { name: 'Rare idioms and proverbs', category: 'Vocabulary', level: 'C2' },
  { name: 'Specialized terminology', category: 'Vocabulary', level: 'C2' },
  { name: 'Literary and poetic vocabulary', category: 'Vocabulary', level: 'C2' },
  { name: 'Slang and colloquialisms', category: 'Vocabulary', level: 'C2' },
  { name: 'Cultural references and allusions', category: 'Vocabulary', level: 'C2' },
  // Functions
  { name: 'Rhetorical devices', category: 'Speaking', level: 'C2' },
  { name: 'Humor and wordplay', category: 'Speaking', level: 'C2' },
  { name: 'Persuasive essay writing', category: 'Speaking', level: 'C2' },
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

const chatIdempotencyStore = createChatIdempotencyStore(db);
const writingAnalysisService = createWritingAnalysisService({
  db,
  analyzer: createGeminiWritingAnalyzer({ genAI }),
});
const deviceTokenService = createDeviceTokenService(db);
const deviceAuth = createDeviceAuthMiddleware(db);

const configuredCorsOrigins = String(process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const productionCors = {
  origin(origin, callback) {
    if (!origin || configuredCorsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
};

app.use(cors(process.env.NODE_ENV === 'production' ? productionCors : undefined));

const authService = createAuthService(db);
const authMiddleware = createAuthMiddleware(db);

const publicApiEndpoints = new Set([
  '/api/auth/signup',
  '/api/auth/login',
  '/api/auth/me',
  '/api/auth/logout',
  '/api/health',
  '/api/status',
  '/api/ready',
  '/api/live',
  '/mac-appcast.xml',
  '/appcast.xml',
  '/english/mac-appcast.xml',
  '/english/appcast.xml',
]);

app.get(['/mac-appcast.xml', '/appcast.xml', '/english/mac-appcast.xml', '/english/appcast.xml'], (req, res) => {
  const candidates = [
    '/srv/LinguaLearn/releases/mac-appcast.xml',
    resolve(__dirname, '../../releases/mac-appcast.xml'),
    resolve(__dirname, '../../macos/LinguaLearnCapture/.build/release-dist/mac-appcast.xml'),
  ];
  let appcastPath = null;
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      appcastPath = candidate;
      break;
    }
  }
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  if (appcastPath) {
    return res.sendFile(appcastPath);
  }
  const defaultXml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.sparkle-project.org/Sparkle/1.0">
  <channel>
    <title>LinguaLearn Capture Updates</title>
    <link>https://145.239.82.124.sslip.io/english/</link>
    <description>Most recent updates to LinguaLearn Capture for macOS.</description>
    <language>en</language>
  </channel>
</rss>`;
  return res.send(defaultXml);
});

app.get(['/releases/:file', '/english/releases/:file'], (req, res) => {
  const rawFile = String(req.params.file || '');
  const safeFile = basename(rawFile);
  if (!safeFile || safeFile === '.' || safeFile === '..' || safeFile !== rawFile) {
    return res.status(400).json({ error: 'Invalid release file parameter' });
  }

  const baseDirs = [
    resolve('/srv/LinguaLearn/releases'),
    resolve(__dirname, '../../releases'),
    resolve(__dirname, '../../macos/LinguaLearnCapture/.build/release-dist'),
  ];

  for (const baseDir of baseDirs) {
    const targetPath = resolve(baseDir, safeFile);
    if (targetPath.startsWith(baseDir + sep)) {
      if (fs.existsSync(targetPath)) {
        return res.sendFile(targetPath);
      }
    }
  }
  return res.status(404).json({ error: 'Release file not found' });
});

app.use('/api', (req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

  const pathname = req.originalUrl ? req.originalUrl.split('?')[0] : req.path;
  if (publicApiEndpoints.has(pathname)) {
    return next();
  }

  return authMiddleware(req, res, next);
});

app.post(
  '/api/writing/analyze',
  deviceAuth,
  express.json({ limit: '32kb' }),
  createWritingAnalyzeHandler({ service: writingAnalysisService }),
);
app.get(
  '/api/writing/samples',
  deviceAuth,
  createWritingSamplesHandler({ service: writingAnalysisService }),
);
app.post(
  '/api/writing/samples/:id/feedback',
  deviceAuth,
  express.json({ limit: '32kb' }),
  createWritingFeedbackHandler({ service: writingAnalysisService }),
);
app.use(express.json({ limit: '5mb' }));

app.post('/api/auth/signup', (req, res) => authService.signup(req, res));
app.post('/api/auth/login', (req, res) => authService.login(req, res));
app.get('/api/auth/me', (req, res) => authService.me(req, res));
app.post('/api/auth/logout', (req, res) => authService.logout(req, res));

app.post('/api/devices/tokens', authMiddleware, (req, res) => deviceTokenService.handleCreateToken(req, res));
app.get('/api/devices/tokens', authMiddleware, (req, res) => deviceTokenService.handleListTokens(req, res));
app.post('/api/devices/tokens/:id/revoke', authMiddleware, (req, res) => deviceTokenService.handleRevokeToken(req, res));

const dailyPracticeService = createDailyPracticeService(db);
app.get('/api/practice/today', (req, res) => dailyPracticeService.getTodaySession(req, res));
app.get('/api/practice/sessions/:id', (req, res) => dailyPracticeService.getSessionById(req, res));
app.post('/api/practice/sessions/:id/complete', (req, res) => dailyPracticeService.completeSession(req, res));

const REPO_ROOT = resolve(__dirname, '../..');
const SERVER_BUILD_TIME = process.env.BUILD_TIME || process.env.BUILD_TIMESTAMP || new Date().toISOString();
const SERVER_APP_VERSION = process.env.APP_VERSION || '1.0.0-beta';

function getGitCommit() {
  if (process.env.GIT_COMMIT) return process.env.GIT_COMMIT;
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function buildHealthResponse() {
  db.prepare('SELECT 1 AS ok').get();

  return {
    status: 'healthy',
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    gitCommit: getGitCommit(),
    buildTime: SERVER_BUILD_TIME,
    appVersion: SERVER_APP_VERSION,
    modelTruth: {
      writingModel: process.env.GEMINI_WRITING_MODEL || 'gemini-3.5-flash-lite',
      chatModel: process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash-lite',
      canonicalModel: 'gemini-3.5-flash-lite',
    },
    checks: {
      database: 'healthy',
      gemini: geminiEnabled ? 'configured' : 'not_configured',
      model: 'gemini-3.5-flash-lite',
    },
    features: {
      aiChat: geminiEnabled,
      writingCapture: Boolean(String(process.env.CAPTURE_API_TOKEN || '').trim()),
      readerTranslation: geminiEnabled,
      readerImport: true,
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
        gitCommit: getGitCommit(),
        buildTime: SERVER_BUILD_TIME,
        appVersion: SERVER_APP_VERSION,
        checks: {
          database: 'unhealthy',
          gemini: geminiEnabled ? 'configured' : 'not_configured',
        },
        error: error.message,
      });
    }
  }
);

// Уровни английского языка по приоритету
const LEVEL_PRIORITY = {
  'A1': 6,
  'A2': 5,
  'B1': 4,
  'B2': 3,
  'C1': 2,
  'C2': 1
};

// Get context for LLM
function getTopicsContext(userIdInput) {
  const userId = userIdInput || 1;
  const settings = db.prepare('SELECT max_level FROM user_settings WHERE user_id = ?').get(userId) || { max_level: 'B2' };
  const maxLevelPriority = LEVEL_PRIORITY[settings.max_level] || 1;

  // Active topics from user_topic_progress
  const activeTopics = db.prepare(`
    SELECT c.id, c.name, c.category, c.level,
           p.status, p.score, p.success_count, p.error_count as failure_count
    FROM curriculum_topics c
    JOIN user_topic_progress p ON c.id = p.curriculum_topic_id AND p.user_id = ?
    WHERE p.status != 'not_started'
    ORDER BY p.score ASC, c.level DESC
  `).all(userId);
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

  let context = `User is learning English (max level: ${settings.max_level}).\n\n`;
  
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
6. Maintain natural dialogue IN ENGLISH

IMPORTANT: Track BOTH mistakes AND successes in ALL interactions. Be gentle when correcting in casual chat. When tracking, prefer using the exact curriculum topic names listed above.`;
  
  return context;
}

function extractTaggedObject(text, tagName) {
  const prefixPattern = new RegExp(`\\[${tagName}:\\s*`, 'g');
  const match = prefixPattern.exec(text);
  if (!match) return null;

  const jsonStart = match.index + match[0].length;
  let braceCount = 0;
  let insideString = false;
  let escaped = false;

  for (let index = jsonStart; index < text.length; index += 1) {
    const character = text[index];
    if (insideString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') insideString = false;
      continue;
    }
    if (character === '"') {
      insideString = true;
      continue;
    }
    if (character === '{') braceCount += 1;
    if (character !== '}') continue;

    braceCount -= 1;
    if (braceCount === 0) {
      const closingBracket = text.indexOf(']', index + 1);
      const end = closingBracket === index + 1 ? closingBracket + 1 : index + 1;
      return {
        json: text.slice(jsonStart, index + 1),
        start: match.index,
        end,
      };
    }
  }

  return null;
}

function dedupeChatTopicUpdates(updates) {
  const byTopic = new Map();
  for (const update of Array.isArray(updates) ? updates : []) {
    if (!update || typeof update.topic !== 'string' || !update.topic.trim()) continue;
    const normalized = {
      topic: update.topic.trim(),
      category: typeof update.category === 'string' && update.category.trim()
        ? update.category.trim()
        : 'Grammar',
      level: /^(A1|A2|B1|B2|C1|C2)$/.test(update.level) ? update.level : 'B2',
      success: update.success === true,
    };
    const canonicalTopic = findCurriculumTopic(normalized.topic);
    if (canonicalTopic) {
      normalized.topic = canonicalTopic.name;
      normalized.category = canonicalTopic.category;
      normalized.level = canonicalTopic.level;
    }
    const key = canonicalTopic
      ? `curriculum:${canonicalTopic.id}`
      : `new:${normalized.topic.toLocaleLowerCase('en-US')}`;
    const existing = byTopic.get(key);
    if (!existing || (!normalized.success && existing.success)) byTopic.set(key, normalized);
  }
  return [...byTopic.values()];
}

// API: Чат с ЛЛМ
app.post('/api/chat', async (req, res) => {
  let reservedMessageId = null;
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { message, messageId: rawMessageId } = req.body || {};
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message must be a non-empty string.' });
    }
    const messageId = normalizeOptionalMessageId(rawMessageId);
    const reservation = chatIdempotencyStore.begin(messageId, message, userId);
    if (reservation.state === 'cached') {
      res.set('X-Idempotent-Replay', 'true');
      return res.json(reservation.response);
    }
    if (reservation.state === 'processing') {
      res.set('Retry-After', '1');
      return res.status(409).json({
        error: 'This chat message is already being processed.',
        code: 'MESSAGE_IN_PROGRESS',
      });
    }
    if (reservation.state === 'reserved') reservedMessageId = messageId;

    if (!ensureGeminiAvailable(res, ['aiChat'])) {
      chatIdempotencyStore.release(reservedMessageId, userId);
      reservedMessageId = null;
      return;
    }

    // Последние 10 завершенных сообщений; текущее сохраняется только после успешного AI-ответа.
    const history = db.prepare('SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT 10').all(userId).reverse();
    
    const systemPrompt = `You are a friendly and professional English language tutor. Your tasks:
1. Help the user learn English through natural dialogue IN ENGLISH ONLY
2. Give varied learning activities: casual chat, exercises, recommendations
3. Track mistakes and successes
4. After each user's answer to a task, evaluate it and report the result

${getTopicsContext(userId)}

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
Let's practice Past Simple! Here's a quick quiz:
[EXERCISE: {"type": "multiple-choice", "question": "Yesterday, I ___ to the store.", "options": ["go", "went", "goes", "going"], "correctAnswer": "went", "topic": "Past Simple", "level": "A2"}]

Example fill-blank:
[EXERCISE: {"type": "fill-blank", "question": "She ___ (to be) happy yesterday.", "correctAnswer": "was", "topic": "Past Simple - verb to be", "level": "A1"}]

Example open question:
[EXERCISE: {"type": "open", "question": "Write a sentence about what you did last weekend using Past Simple.", "topic": "Past Simple", "level": "A2"}]

TOPICS UPDATE - MANDATORY:
**EVERY TIME** a user answers an exercise (correct or incorrect), you MUST include:
[TOPICS_UPDATE: {"updates": [{"topic": "topic name", "category": "grammar/vocabulary/pronunciation/etc", "level": "A1-C2", "success": true/false}]}]

NO EXCEPTIONS - This is automatic, not optional.

When user answers CORRECTLY:
Response: "Excellent! 'An' is the correct answer. 🎉
[TOPICS_UPDATE: {"updates": [{"topic": "Articles (a/an)", "category": "Grammar", "level": "A2", "success": true}]}]"

When user answers INCORRECTLY:
Response: "Not quite! The correct answer is 'watched'.
[TOPICS_UPDATE: {"updates": [{"topic": "Past Simple", "category": "Grammar", "level": "A2", "success": false}]}]"

CRITICAL: Do NOT say "let's add this topic" - just include the tag directly. The topic will be created automatically.

VOCABULARY SYSTEM:
When user asks about a word meaning, or you introduce a new useful word, you can add it to their vocabulary:
[VOCAB_ADD: {"word": "word here", "translation": "перевод здесь", "example": "Example sentence with the word."}]

Example:
Great question! "Serendipity" means a happy accident or pleasant surprise.
[VOCAB_ADD: {"word": "serendipity", "translation": "счастливая случайность", "example": "Finding this café was pure serendipity!"}]

WHAT TO TRACK AND HOW:

📚 Use [TOPICS_UPDATE: ...] for GRAMMAR topics — BOTH mistakes AND correct usage:
- Wrong tense, agreement, word order → success: false
- Article errors: missing/wrong articles (a/an/the) → success: false
- Preposition mistakes: wrong preposition usage → success: false
- Sentence structure errors → success: false
- **ALSO track when user CORRECTLY uses grammar**: if user writes a correct sentence using Present Perfect, Past Simple, conditionals, etc. → success: true

📖 Use [VOCAB_ADD: ...] for VOCABULARY/SPELLING issues:
- Misspelled words (e.g. "bussiness" → "business")
- Wrong word choice, false friends
- New useful words the user doesn't know

❌ Don't track:
- Simple capitalization issues
- One-time obvious typos (single letter off)

TRACKING CORRECT GRAMMAR IN CASUAL CHAT:
When user writes grammatically correct sentences, notice the grammar structures they used well and track them!
Example: User says "If I had known about the party, I would have come."
→ Track: [TOPICS_UPDATE: {"updates": [{"topic": "Third Conditional (if + would have)", "category": "Grammar", "level": "B2", "success": true}]}]

Example: User says "I've been living here for 5 years."
→ Track: [TOPICS_UPDATE: {"updates": [{"topic": "Present Perfect Continuous", "category": "Grammar", "level": "B1", "success": true}]}]

Don't track every single sentence — only when the user demonstrates a notable grammar structure (conditionals, perfect tenses, passive voice, relative clauses, etc.)

CASUAL CONVERSATION ERROR CORRECTION:
When user makes mistakes in casual chat, you MUST:
1. Gently point out the error in a friendly way
2. For grammar errors → use [TOPICS_UPDATE: ...] to create/update a grammar topic
3. For spelling/vocabulary errors → use [VOCAB_ADD: ...] to add the correct word to their dictionary
4. Don't interrupt the flow of conversation - correct naturally within your response

Example (spelling/vocab error):
User: "I have big problems in my bussiness and a huge economical crysis"
Response: "I'm sorry to hear that! By the way, a couple of small notes:
- It's **business** (one 's'), not 'bussiness' 😊
- And **crisis**, not 'crysis'
- Also, we say **economic crisis**, not 'economical crisis' — 'economic' describes things related to the economy, while 'economical' means 'cheap/saving money'.
[VOCAB_ADD: {"word": "business", "translation": "бизнес, дело", "example": "I have big problems in my business."}]
[VOCAB_ADD: {"word": "crisis", "translation": "кризис", "example": "We are facing a huge economic crisis."}]
[VOCAB_ADD: {"word": "economic", "translation": "экономический", "example": "The economic situation is getting worse."}]"

Example (grammar error):
User: "Yesterday I go to the store and buyed milk"
Response: "Got it! Small grammar note: in Past Simple, it should be '**went**' (not 'go') and '**bought**' (not 'buyed') 😊
[TOPICS_UPDATE: {"updates": [{"topic": "Past Simple (irregular verbs)", "category": "Grammar", "level": "A2", "success": false}]}]"

Example (correct grammar noticed):
User: "I would have called you, but my phone was dead."
Response: "Great story! And excellent use of the Third Conditional, by the way! 👏
[TOPICS_UPDATE: {"updates": [{"topic": "Third Conditional (if + would have)", "category": "Grammar", "level": "B2", "success": true}]}]"

IMPORTANT RULES:
- Always communicate in English, even if user writes in another language
- If user declines an activity, say "No problem! What would you like to do instead?"
- Vary your approach naturally - don't be too rigid
- Celebrate successes enthusiastically
- Be encouraging with mistakes - correct them gently, never mock
- Add useful vocabulary when teaching new words
- Use [TOPICS_UPDATE: ...] ONLY for grammar, use [VOCAB_ADD: ...] for words/spelling
- When tracking topics, try to use exact names from the CEFR curriculum when possible`;

    const model = genAI.getGenerativeModel({ 
      model: geminiChatModel,
      systemInstruction: systemPrompt
    });

    const chat = model.startChat({
      history: normalizeGeminiChatHistory(history),
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
    
    const topicTag = extractTaggedObject(responseText, 'TOPICS_UPDATE');
    let pendingTopicUpdates = [];
    if (topicTag) {
      try {
        pendingTopicUpdates = dedupeChatTopicUpdates(JSON.parse(topicTag.json).updates);
      } catch (error) {
        console.error('Error parsing topic updates:', error);
      }
    }

    const vocabTag = extractTaggedObject(responseText, 'VOCAB_ADD');
    let pendingVocabulary = null;
    if (vocabTag) {
      try {
        const vocab = JSON.parse(vocabTag.json);
        if (
          vocab &&
          typeof vocab.word === 'string' && vocab.word.trim() &&
          typeof vocab.translation === 'string' && vocab.translation.trim()
        ) {
          pendingVocabulary = {
            word: vocab.word.trim(),
            translation: vocab.translation.trim(),
            example: typeof vocab.example === 'string' ? vocab.example.trim() : null,
          };
        }
      } catch (error) {
        console.error('Error parsing vocab add:', error);
      }
    }

    const metadataRanges = [topicTag, vocabTag]
      .filter(Boolean)
      .sort((left, right) => right.start - left.start);
    let cleanResponse = responseText;
    for (const range of metadataRanges) {
      cleanResponse = cleanResponse.slice(0, range.start) + cleanResponse.slice(range.end);
    }
    cleanResponse = cleanResponse.trim();

    const commitChatResponse = db.transaction(() => {
      db.prepare('INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)').run(userId, 'user', message);

      const topicChanges = [];
      for (const update of pendingTopicUpdates) {
        const result = updateTopic(update.topic, update.category, update.level, update.success, userId);
        if (result) topicChanges.push(result);
      }

      if (pendingVocabulary) {
        const norm = pendingVocabulary.word.toLowerCase();
        const existing = db.prepare('SELECT id FROM vocabulary WHERE user_id = ? AND normalized_word = ?').get(userId, norm);
        if (!existing) {
          db.prepare(`
            INSERT INTO vocabulary (user_id, word, normalized_word, translation, example, level, next_review)
            VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
          `).run(
            userId,
            pendingVocabulary.word,
            norm,
            pendingVocabulary.translation,
            pendingVocabulary.example || null,
          );
        }
      }

      db.prepare('INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)').run(userId, 'assistant', cleanResponse);
      const responsePayload = {
        response: cleanResponse,
        ...(topicChanges.length > 0 ? { topicChanges } : {}),
      };
      chatIdempotencyStore.complete(reservedMessageId, responsePayload, userId);
      return responsePayload;
    });

    const responsePayload = commitChatResponse();
    reservedMessageId = null;
    res.set('X-Idempotent-Replay', 'false');
    res.json(responsePayload);
  } catch (error) {
    chatIdempotencyStore.release(reservedMessageId, userId);
    console.error('Chat error:', error);
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    res.status(statusCode).json({
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
    });
  }
});

// Функция обновления темы — writes directly to curriculum_topics
function findCurriculumTopic(name) {
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

  return existing || null;
}

function updateTopic(name, category, level, success, userIdInput = 1) {
  const userId = userIdInput || 1;
  let existing = findCurriculumTopic(name);

  if (!existing) {
    // AI detected a new topic — add to curriculum_topics
    const inserted = db.prepare(`
      INSERT INTO curriculum_topics (name, category, level, source, created_at)
      VALUES (?, ?, ?, 'ai_detected', CURRENT_TIMESTAMP)
    `).run(name, category, level);
    existing = db.prepare('SELECT * FROM curriculum_topics WHERE id = ?').get(inserted.lastInsertRowid);
  }

  const rec = recordTopicEvidence(db, {
    userId,
    curriculumTopicId: existing.id,
    outcome: success ? 'success' : 'error',
    confidence: 1.0,
  });

  return {
    isNew: existing.source === 'ai_detected' && (existing.success_count || 0) === 0 && (existing.failure_count || 0) === 0,
    name: existing.name,
    category: existing.category,
    level: existing.level,
    status: rec.status,
    newScore: Math.round(rec.score),
    success,
  };
}

// API: Получение всех тем (reads from user_topic_progress)
app.get('/api/topics', (req, res) => {
  try {
    const userId = getUserId(req);
    const settings = db.prepare('SELECT max_level FROM user_settings WHERE user_id = ?').get(userId) || { max_level: 'B2' };
    const maxLevelPriority = LEVEL_PRIORITY[settings.max_level] || 1;
    
    const topics = db.prepare(`
      SELECT c.id, c.name, c.category, c.level, c.source, c.created_at,
             COALESCE(p.status, 'not_started') as status,
             COALESCE(p.score, 0) as score,
             COALESCE(p.is_locked, 0) as is_locked,
             COALESCE(p.success_count, 0) as success_count,
             COALESCE(p.error_count, 0) as failure_count,
             COALESCE(p.unique_practice_days, 0) as unique_practice_days,
             p.last_practiced,
             p.last_error_at,
             p.last_success_at
      FROM curriculum_topics c
      JOIN user_topic_progress p ON c.id = p.curriculum_topic_id AND p.user_id = ?
      WHERE p.status != 'not_started'
      ORDER BY p.score ASC, c.level DESC
    `).all(userId);

    for (const t of topics) {
      t.mastery_confidence = calculateMasteryConfidence({
        score: t.score,
        success_count: t.success_count,
        error_count: t.failure_count,
        unique_practice_days: t.unique_practice_days,
        last_error_at: t.last_error_at,
        last_success_at: t.last_success_at,
      });
    }

    const relevantTopics = topics.filter(t => LEVEL_PRIORITY[t.level] >= maxLevelPriority);
    
    res.json({ topics: relevantTopics, maxLevel: settings.max_level });
  } catch (error) {
    console.error('Error fetching topics:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Получение настроек пользователя
function handleGetSettings(req, res) {
  try {
    const userId = getUserId(req);
    db.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').run(userId);
    const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
    res.json(settings || {
      user_id: userId,
      max_level: 'C2',
      dark_mode: 0,
      notifications_enabled: 1,
      external_capture_enabled: 1,
      raw_text_retention_days: 7,
      allowed_apps: 'ALL',
      denied_apps: '',
      capture_paused: 0,
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: error.message });
  }
}

// API: Обновление настроек пользователя
function handlePostSettings(req, res) {
  try {
    const userId = getUserId(req);
    db.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').run(userId);

    const {
      maxLevel, max_level,
      cefrLevel, cefr_level,
      darkMode, dark_mode,
      notificationsEnabled, notifications_enabled,
      externalCaptureEnabled, external_capture_enabled,
      rawTextRetentionDays, raw_text_retention_days,
      allowedApps, allowed_apps,
      deniedApps, denied_apps,
      capturePaused, capture_paused,
      onboardingCompleted, onboarding_completed,
      onboardingStep, onboarding_step,
    } = req.body || {};

    const levelVal = max_level !== undefined ? max_level : (maxLevel !== undefined ? maxLevel : (cefr_level !== undefined ? cefr_level : cefrLevel));
    const cefrVal = cefr_level !== undefined ? cefr_level : cefrLevel;
    const darkVal = dark_mode !== undefined ? dark_mode : darkMode;
    const notifVal = notifications_enabled !== undefined ? notifications_enabled : notificationsEnabled;
    const extCapVal = external_capture_enabled !== undefined ? external_capture_enabled : externalCaptureEnabled;
    const retVal = raw_text_retention_days !== undefined ? raw_text_retention_days : rawTextRetentionDays;
    const allowVal = allowed_apps !== undefined ? allowed_apps : allowedApps;
    const denyVal = denied_apps !== undefined ? denied_apps : deniedApps;
    const pauseVal = capture_paused !== undefined ? capture_paused : capturePaused;
    const compVal = onboarding_completed !== undefined ? onboarding_completed : onboardingCompleted;
    const stepVal = onboarding_step !== undefined ? onboarding_step : onboardingStep;

    const updates = [];
    const params = [];

    if (cefrVal !== undefined) {
      db.prepare('UPDATE users SET cefr_level = ? WHERE id = ?').run(String(cefrVal), userId);
    }
    if (levelVal !== undefined) {
      updates.push('max_level = ?');
      params.push(String(levelVal));
    }
    if (darkVal !== undefined) {
      updates.push('dark_mode = ?');
      params.push(darkVal ? 1 : 0);
    }
    if (notifVal !== undefined) {
      updates.push('notifications_enabled = ?');
      params.push(notifVal ? 1 : 0);
    }
    if (extCapVal !== undefined) {
      updates.push('external_capture_enabled = ?');
      params.push(extCapVal ? 1 : 0);
    }
    if (retVal !== undefined) {
      const days = Number(retVal);
      if ([0, 7, 30].includes(days)) {
        updates.push('raw_text_retention_days = ?');
        params.push(days);
      }
    }
    if (allowVal !== undefined) {
      const str = Array.isArray(allowVal) ? allowVal.join(',') : String(allowVal);
      updates.push('allowed_apps = ?');
      params.push(str);
    }
    if (denyVal !== undefined) {
      const str = Array.isArray(denyVal) ? denyVal.join(',') : String(denyVal);
      updates.push('denied_apps = ?');
      params.push(str);
    }
    if (pauseVal !== undefined) {
      updates.push('capture_paused = ?');
      params.push(pauseVal ? 1 : 0);
    }
    if (compVal !== undefined) {
      updates.push('onboarding_completed = ?');
      params.push(compVal ? 1 : 0);
    }
    if (stepVal !== undefined) {
      updates.push('onboarding_step = ?');
      params.push(Number(stepVal));
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(userId);
      db.prepare(`UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = ?`).run(...params);
    }

    const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
    res.json(settings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: error.message });
  }
}

app.get('/api/user/settings', handleGetSettings);
app.post('/api/user/settings', handlePostSettings);
app.get('/api/settings', handleGetSettings);
app.post('/api/settings', handlePostSettings);

// API: Submit Beta Feedback (VAL-UI-004)
function handlePostFeedback(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { category, message, route, app_version, appVersion } = req.body || {};
    const trimmedMessage = String(message || '').trim();
    if (!trimmedMessage) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const feedbackCategory = String(category || 'ux_feedback').trim();
    const feedbackRoute = String(route || '/feedback').trim();
    const clientAppVersion = String(app_version || appVersion || '1.0.0-beta').trim();

    const properties = {
      category: feedbackCategory,
      message: trimmedMessage,
      route: feedbackRoute,
      app_version: clientAppVersion,
      timestamp: new Date().toISOString(),
    };

    const result = logAnalyticsEvent(db, userId, 'beta_feedback', properties);

    return res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      feedback: {
        id: result?.lastInsertRowid || null,
        category: feedbackCategory,
        message: trimmedMessage,
        route: feedbackRoute,
        app_version: clientAppVersion,
        created_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    return res.status(500).json({ error: error.message });
  }
}

app.post('/api/feedback', authMiddleware, handlePostFeedback);

// API: Aggregated Admin Metrics (VAL-ADM-002)
function handleAdminMetrics(req, res) {
  try {
    if (!req.user || (req.user.role !== 'owner' && req.user.role !== 'admin')) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    const metrics = getSystemMetrics(db);
    return res.status(200).json(metrics);
  } catch (error) {
    console.error('Error fetching admin metrics:', error);
    return res.status(500).json({ error: error.message });
  }
}

app.get('/api/admin/metrics', authMiddleware, handleAdminMetrics);

// API: Export My Data (VAL-PRIV-005)
function handleExportData(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userProfile = db.prepare('SELECT id, email, role, status, cefr_level, created_at, updated_at FROM users WHERE id = ?').get(userId);
    if (!userProfile) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').run(userId);
    const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);

    const vocabulary = db.prepare('SELECT * FROM vocabulary WHERE user_id = ? ORDER BY id ASC').all(userId);
    const progress = db.prepare(`
      SELECT p.*, c.name as topic_name, c.category, c.level
      FROM user_topic_progress p
      LEFT JOIN curriculum_topics c ON p.curriculum_topic_id = c.id
      WHERE p.user_id = ?
      ORDER BY p.id ASC
`).all(userId);
    const writingSamples = db.prepare('SELECT * FROM writing_samples WHERE user_id = ? ORDER BY id ASC').all(userId);
    const evidence = db.prepare('SELECT * FROM grammar_evidence WHERE user_id = ? ORDER BY id ASC').all(userId);
    const practiceSessions = db.prepare('SELECT * FROM practice_sessions WHERE user_id = ? ORDER BY id ASC').all(userId);
    const chatHistory = db.prepare('SELECT id, role, content, timestamp FROM chat_history WHERE user_id = ? ORDER BY id ASC').all(userId);
    const deviceTokens = db.prepare('SELECT id, device_name, app_version, last_used_at, revoked_at, created_at FROM device_tokens WHERE user_id = ? ORDER BY id ASC').all(userId);
    const feedback = db.prepare('SELECT * FROM correction_feedback WHERE user_id = ? ORDER BY id ASC').all(userId);
    const analyticsEvents = db.prepare('SELECT * FROM analytics_events WHERE user_id = ? ORDER BY id ASC').all(userId);

    const exportBundle = {
      exported_at: new Date().toISOString(),
      user: userProfile,
      settings: settings || null,
      vocabulary,
      progress,
      evidence,
      writing_samples: writingSamples,
      practice_sessions: practiceSessions,
      chat_history: chatHistory,
      device_tokens: deviceTokens,
      feedback,
      analytics_events: analyticsEvents,
    };

    res.setHeader('Content-Type', 'application/json');
    res.json(exportBundle);
  } catch (error) {
    console.error('Error exporting user data:', error);
    res.status(500).json({ error: error.message });
  }
}

// API: Cascading Account Deletion (VAL-PRIV-006)
function handleDeleteAccount(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { confirm, confirmation } = req.body || {};
    const confirmParam = req.query?.confirm || req.query?.confirmation;
    const isConfirmed = confirm === true || confirm === 'true' || confirm === 'DELETE' ||
                        confirmation === true || confirmation === 'true' || confirmation === 'DELETE' ||
                        confirmParam === 'true' || confirmParam === 'DELETE' || confirmParam === '1';

    if (!isConfirmed) {
      return res.status(400).json({ error: 'Confirmation required for account deletion' });
    }

    const userRow = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!userRow) {
      return res.status(404).json({ error: 'User not found' });
    }

    const performAccountDeletion = db.transaction((targetUserId) => {
      db.prepare('UPDATE beta_invites SET used_by = NULL WHERE used_by = ?').run(targetUserId);
      db.prepare('UPDATE beta_invites SET created_by = NULL WHERE created_by = ?').run(targetUserId);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetUserId);
      db.prepare('DELETE FROM device_tokens WHERE user_id = ?').run(targetUserId);
      db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(targetUserId);
      db.prepare('DELETE FROM user_topic_progress WHERE user_id = ?').run(targetUserId);
      db.prepare('DELETE FROM grammar_evidence WHERE user_id = ?').run(targetUserId);
      db.prepare('DELETE FROM correction_feedback WHERE user_id = ?').run(targetUserId);
      db.prepare('DELETE FROM writing_samples WHERE user_id = ?').run(targetUserId);
      db.prepare('DELETE FROM practice_sessions WHERE user_id = ?').run(targetUserId);
      db.prepare('DELETE FROM chat_history WHERE user_id = ?').run(targetUserId);
      db.prepare('DELETE FROM chat_requests WHERE user_id = ?').run(targetUserId);
      db.prepare('DELETE FROM vocabulary WHERE user_id = ?').run(targetUserId);
      db.prepare('DELETE FROM analytics_events WHERE user_id = ?').run(targetUserId);
      db.prepare('DELETE FROM achievements WHERE user_id = ?').run(targetUserId);
      db.prepare('DELETE FROM users WHERE id = ?').run(targetUserId);
    });

    performAccountDeletion(userId);

    res.clearCookie('lingua_session', { path: '/' });
    res.json({ success: true, message: 'Account and all associated data deleted' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: error.message });
  }
}

app.get('/api/user/export', handleExportData);
app.delete('/api/user/account', handleDeleteAccount);


// API: Ручное обновление темы
app.post('/api/topics/update', (req, res) => {
  const userId = getUserId(req);
  const { topic, category, level, success } = req.body;
  const result = updateTopic(topic, category, level, success, userId);
  res.json({ success: true, result });
});

// API: Удаление/сброс темы
app.delete('/api/topics/:id', (req, res) => {
  const userId = getUserId(req);
  const topic = db.prepare('SELECT * FROM curriculum_topics WHERE id = ?').get(req.params.id);
  if (topic && topic.source === 'ai_detected') {
    db.prepare('DELETE FROM curriculum_topics WHERE id = ?').run(req.params.id);
    db.prepare('DELETE FROM user_topic_progress WHERE curriculum_topic_id = ?').run(req.params.id);
  } else if (topic) {
    db.prepare(
      "UPDATE user_topic_progress SET status = 'not_started', score = 0, success_count = 0, error_count = 0, last_practiced = NULL, last_error_at = NULL, last_success_at = NULL, unique_practice_days = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND curriculum_topic_id = ?"
    ).run(userId, req.params.id);
  }
  res.json({ success: true });
});

// API: Получение истории чата
app.get('/api/chat/history', (req, res) => {
  try {
    const userId = getUserId(req);
    const history = db.prepare('SELECT role, content, timestamp FROM chat_history WHERE user_id = ? ORDER BY id ASC').all(userId);
    res.json({ history });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Очистка истории чата
app.delete('/api/chat/clear', (req, res) => {
  const userId = getUserId(req);
  db.prepare('DELETE FROM chat_history WHERE user_id = ?').run(userId);
  res.json({ success: true });
});


// ==================== VOCABULARY GROUPS API ====================

app.get('/api/vocabulary/groups', (req, res) => {
  try {
    const userId = getUserId(req);
    let groups = [];
    let memberRows = [];
    try {
      groups = db.prepare(`
        SELECT g.id, g.user_id, g.name, g.created_at, COUNT(gm.vocabulary_id) AS word_count
        FROM vocabulary_groups g
        LEFT JOIN vocabulary_group_members gm ON gm.group_id = g.id
        WHERE g.user_id = ?
        GROUP BY g.id
        ORDER BY g.name COLLATE NOCASE ASC
      `).all(userId);

      memberRows = db.prepare(`
        SELECT gm.group_id, gm.vocabulary_id
        FROM vocabulary_group_members gm
        JOIN vocabulary_groups g ON g.id = gm.group_id
        WHERE g.user_id = ?
      `).all(userId);
    } catch (e) {
      groups = [];
      memberRows = [];
    }

    const wordIdsByGroup = new Map();
    for (const row of memberRows) {
      if (!wordIdsByGroup.has(row.group_id)) {
        wordIdsByGroup.set(row.group_id, []);
      }
      wordIdsByGroup.get(row.group_id).push(row.vocabulary_id);
    }

    const result = groups.map((g) => ({
      id: g.id,
      user_id: g.user_id,
      name: g.name,
      created_at: g.created_at,
      word_count: Number(g.word_count) || 0,
      word_ids: wordIdsByGroup.get(g.id) || [],
    }));

    res.json({ groups: result });
  } catch (error) {
    console.error('Error fetching vocabulary groups:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vocabulary/groups', (req, res) => {
  try {
    const userId = getUserId(req);
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Group name cannot be empty' });

    const existing = db.prepare('SELECT id FROM vocabulary_groups WHERE user_id = ? AND name = ? COLLATE NOCASE').get(userId, name);
    if (existing) return res.status(409).json({ error: 'Group with this name already exists' });

    const result = db.prepare('INSERT INTO vocabulary_groups (user_id, name) VALUES (?, ?)').run(userId, name);
    const group = { id: result.lastInsertRowid, user_id: userId, name, word_count: 0, word_ids: [], created_at: new Date().toISOString() };
    res.status(201).json({ group });
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/vocabulary/groups/:id', (req, res) => {
  try {
    const userId = getUserId(req);
    const groupId = Number(req.params.id);
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Group name cannot be empty' });

    const group = db.prepare('SELECT id FROM vocabulary_groups WHERE id = ? AND user_id = ?').get(groupId, userId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const duplicate = db.prepare('SELECT id FROM vocabulary_groups WHERE user_id = ? AND name = ? COLLATE NOCASE AND id != ?').get(userId, name, groupId);
    if (duplicate) return res.status(409).json({ error: 'Group with this name already exists' });

    db.prepare('UPDATE vocabulary_groups SET name = ? WHERE id = ? AND user_id = ?').run(name, groupId, userId);
    res.json({ success: true, group: { id: groupId, name } });
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/vocabulary/groups/:id', (req, res) => {
  try {
    const userId = getUserId(req);
    const groupId = Number(req.params.id);
    const result = db.prepare('DELETE FROM vocabulary_groups WHERE id = ? AND user_id = ?').run(groupId, userId);
    if (result.changes === 0) return res.status(404).json({ error: 'Group not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting group:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/vocabulary/groups/:id/words', (req, res) => {
  try {
    const userId = getUserId(req);
    const groupId = Number(req.params.id);
    const group = db.prepare('SELECT id FROM vocabulary_groups WHERE id = ? AND user_id = ?').get(groupId, userId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const { wordId, wordIds } = req.body || {};
    if (Array.isArray(wordIds)) {
      const validWordIds = wordIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
      const setTx = db.transaction(() => {
        db.prepare('DELETE FROM vocabulary_group_members WHERE group_id = ?').run(groupId);
        const insertMember = db.prepare('INSERT OR IGNORE INTO vocabulary_group_members (group_id, vocabulary_id) VALUES (?, ?)');
        for (const wid of validWordIds) {
          const exists = db.prepare('SELECT id FROM vocabulary WHERE id = ? AND user_id = ?').get(wid, userId);
          if (exists) insertMember.run(groupId, wid);
        }
      });
      setTx();
    } else if (wordId) {
      const exists = db.prepare('SELECT id FROM vocabulary WHERE id = ? AND user_id = ?').get(Number(wordId), userId);
      if (!exists) return res.status(404).json({ error: 'Word not found' });
      db.prepare('INSERT OR IGNORE INTO vocabulary_group_members (group_id, vocabulary_id) VALUES (?, ?)').run(groupId, Number(wordId));
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating group words:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/vocabulary/groups/:id/words/:wordId', (req, res) => {
  try {
    const userId = getUserId(req);
    const groupId = Number(req.params.id);
    const wordId = Number(req.params.wordId);
    const group = db.prepare('SELECT id FROM vocabulary_groups WHERE id = ? AND user_id = ?').get(groupId, userId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    db.prepare('DELETE FROM vocabulary_group_members WHERE group_id = ? AND vocabulary_id = ?').run(groupId, wordId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing word from group:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/vocabulary/:id/groups', (req, res) => {
  try {
    const userId = getUserId(req);
    const wordId = Number(req.params.id);
    const word = db.prepare('SELECT id FROM vocabulary WHERE id = ? AND user_id = ?').get(wordId, userId);
    if (!word) return res.status(404).json({ error: 'Word not found' });

    const groupIds = Array.isArray(req.body?.groupIds) ? req.body.groupIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0) : [];
    const setTx = db.transaction(() => {
      db.prepare(`
        DELETE FROM vocabulary_group_members
        WHERE vocabulary_id = ?
          AND group_id IN (SELECT id FROM vocabulary_groups WHERE user_id = ?)
      `).run(wordId, userId);

      const insertMember = db.prepare('INSERT OR IGNORE INTO vocabulary_group_members (group_id, vocabulary_id) VALUES (?, ?)');
      for (const gid of groupIds) {
        const exists = db.prepare('SELECT id FROM vocabulary_groups WHERE id = ? AND user_id = ?').get(gid, userId);
        if (exists) insertMember.run(gid, wordId);
      }
    });
    setTx();
    res.json({ success: true });
  } catch (error) {
    console.error('Error setting word groups:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== VOCABULARY API ====================

const RESUMABLE_VOCABULARY_MODES = new Set(['once_all', 'favorites']);

function validateVocabularyStudySession(userId, payload = {}) {
  const mode = typeof payload.mode === 'string' ? payload.mode.trim() : '';
  const isGroup = typeof mode === 'string' && (mode.startsWith('group:') || mode.startsWith('groups:'));
  const targetGroupId = isGroup ? Number(mode.split(':')[1]) : null;
  if (!RESUMABLE_VOCABULARY_MODES.has(mode) && !isGroup) {
    const error = new Error('mode must be once_all, favorites, group:<id>, or groups:<ids>');
    error.status = 400;
    throw error;
  }
  if (!Array.isArray(payload.queueIds) || payload.queueIds.length > 10000) {
    const error = new Error('queueIds must be an array with at most 10000 items');
    error.status = 400;
    throw error;
  }
  const queueIds = payload.queueIds.map((id) => Number(id));
  if (queueIds.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(queueIds).size !== queueIds.length) {
    const error = new Error('queueIds must contain unique positive integer ids');
    error.status = 400;
    throw error;
  }
  const roundTotal = Number(payload.roundTotal);
  if (!Number.isSafeInteger(roundTotal) || roundTotal < queueIds.length || roundTotal > 10000) {
    const error = new Error('roundTotal must be between the remaining queue size and 10000');
    error.status = 400;
    throw error;
  }
  if (queueIds.length > 0) {
    const placeholders = queueIds.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, is_favorite, learned_permanently_at FROM vocabulary WHERE user_id = ? AND id IN (${placeholders})`)
      .all(userId, ...queueIds);
    let groupWordIdSet = null;
    if (isGroup) {
      const gRows = db.prepare('SELECT vocabulary_id FROM vocabulary_group_members WHERE group_id = ?').all(targetGroupId);
      groupWordIdSet = new Set(gRows.map((r) => r.vocabulary_id));
    }
    if (
      rows.length !== queueIds.length ||
      rows.some((word) =>
        word.learned_permanently_at ||
        (mode === 'favorites' && !word.is_favorite) ||
        (isGroup && !groupWordIdSet.has(word.id))
      )
    ) {
      const error = new Error('Study queue contains unavailable vocabulary entries');
      error.status = 409;
      throw error;
    }
  }
  return { mode, queueIds, roundTotal };
}


// ==========================================
// API: GENERATE PERSONALIZED EXERCISES (Batch of 10 & Nuanced AI Grammar)
// ==========================================
app.post('/api/exercises/generate', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { topicId, type } = req.body || {};

    const allWords = db.prepare('SELECT id, word, translation, example, learned_permanently_at FROM vocabulary WHERE user_id = ?').all(userId);
    const learnedWords = allWords.filter((w) => w.learned_permanently_at !== null && w.learned_permanently_at !== undefined);
    const activeWords = allWords.filter((w) => !w.learned_permanently_at);

    let selectedPool = [];
    let vocabularySource = 'combined';
    let poolCount = allWords.length;
    let poolLabel = 'All vocabulary';

    if (learnedWords.length >= 100) {
      selectedPool = learnedWords;
      vocabularySource = 'learned_forever';
      poolCount = learnedWords.length;
      poolLabel = `Mastered words (${learnedWords.length})`;
    } else if (activeWords.length >= 100) {
      selectedPool = activeWords;
      vocabularySource = 'active_studying';
      poolCount = activeWords.length;
      poolLabel = `Studying words (${activeWords.length})`;
    } else {
      selectedPool = allWords.length > 0 ? allWords : [{ word: 'house', translation: 'дом', example: 'My house is big.' }];
      vocabularySource = 'combined';
      poolCount = allWords.length;
      poolLabel = `All words (${allWords.length})`;
    }

    const sampledWords = [...selectedPool].sort(() => 0.5 - Math.random()).slice(0, 20);
    const vocabListStr = sampledWords.map((w) => `${w.word} (${w.translation})`).join(', ');

    let topicObj = { name: 'General English Grammar Practice', category: 'Grammar', level: 'B1' };

    if (topicId && topicId !== 'all' && topicId !== 'random' && topicId !== 'weak') {
      const topicRow = db.prepare('SELECT id, name, category, level FROM curriculum_topics WHERE id = ?').get(topicId);
      if (topicRow) {
        topicObj = topicRow;
      }
    }

    const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
    const prompt = `You are an elite English language professor and curriculum examiner.
Your mission is to generate a cohesive set of 10 interactive practice exercises for a student practicing the CEFR topic: "${topicObj.name}" (${topicObj.category}, Level: ${topicObj.level}).

CRITICAL MANDATORY INSTRUCTIONS:
1. GRAMMAR TOPIC & COMPREHENSIVE NUANCE COVERAGE:
   - All 10 exercises MUST strictly test the specific grammar mechanism of "${topicObj.name}".
   - ACROSS THE 10 EXERCISES, YOU MUST SYSTEMATICALLY COVER DIFFERENT NUANCES, ASPECTS, AND SUB-RULES OF THIS TOPIC:
     * Different grammatical persons (I, you, he/she/it, we, they; 1st/2nd/3rd person singular/plural).
     * Affirmative sentences, negative sentences (not...), and questions.
     * Regular patterns vs irregular roots/forms/exceptions relevant to this topic.
     * Distinct contextual situations.
   - DO NOT repeat the same sentence structure or grammatical person repeatedly! Ensure variety and progressive pedagogical depth across the 10 tasks.
   - DO NOT just ask for plain vocabulary translations of isolated words. Every exercise must be a meaningful sentence testing the grammar rule.

2. STUDENT VOCABULARY INTEGRATION:
   - Embed words from the student's vocabulary pool across the 10 exercises: ${vocabListStr}.
   - Naturally integrate these vocabulary words into the subjects, objects, or context of the sentences.

3. EXERCISE FORMAT:
   - Generate an array of 10 items (mix of multiple-choice and fill-blank unless a specific type was requested).
   - For multiple-choice: provide 4 distinct, plausible options in "options". One correct option, three realistic grammatical distractors.
   - For fill-blank: use "___" in the sentence for the blank.
   - For open: provide a clear instruction in Russian with the sentence.

4. RUSSIAN EXPLANATIONS:
   - Every exercise MUST include a clear, detailed "explanation" in Russian explaining the grammar rule, why this answer is correct, and common pitfalls.

OUTPUT FORMAT:
Respond ONLY with a valid JSON object matching this exact schema:
{
  "exercises": [
    {
      "type": "multiple-choice" | "fill-blank" | "open",
      "question": "Question or sentence in English (with Russian instructions/context if needed)",
      "options": ["Option A", "Option B", "Option C", "Option D"], // if multiple-choice
      "correctAnswer": "exact correct answer string",
      "explanation": "Clear grammatical explanation in Russian",
      "topic": "${topicObj.name}",
      "level": "${topicObj.level}",
      "targetWord": "English word from student vocabulary used in this exercise",
      "targetWordTranslation": "Russian translation"
    }
  ]
}`;

    let exercises = [];
    const aiModels = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash-lite'];
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
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
        ]);

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const rawJson = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
          const parsed = JSON.parse(rawJson);
          if (Array.isArray(parsed.exercises) && parsed.exercises.length > 0) {
            exercises = parsed.exercises;
            break;
          } else if (parsed.question && parsed.correctAnswer) {
            exercises = [parsed];
            break;
          }
        }
      } catch (err) {
        console.warn(`Model ${m} error in English batch generation:`, err.message);
      }
    }

    if (!exercises || exercises.length === 0) {
      const single = generateEnglishExercise({
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
      exercise: exercises[0],
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
    const userId = getUserId(req);
    const { topicIds } = req.body || {};

    const allWords = db.prepare('SELECT id, word, translation, example, learned_permanently_at FROM vocabulary WHERE user_id = ?').all(userId);
    const learnedWords = allWords.filter((w) => w.learned_permanently_at !== null && w.learned_permanently_at !== undefined);
    const activeWords = allWords.filter((w) => !w.learned_permanently_at);

    let selectedPool = [];
    let vocabularySource = 'combined';
    let poolCount = allWords.length;
    let poolLabel = 'All vocabulary';

    if (learnedWords.length >= 100) {
      selectedPool = learnedWords;
      vocabularySource = 'learned_forever';
      poolCount = learnedWords.length;
      poolLabel = `Mastered words (${learnedWords.length})`;
    } else if (activeWords.length >= 100) {
      selectedPool = activeWords;
      vocabularySource = 'active_studying';
      poolCount = activeWords.length;
      poolLabel = `Studying words (${activeWords.length})`;
    } else {
      selectedPool = allWords.length > 0 ? allWords : [{ word: 'house', translation: 'дом' }, { word: 'big', translation: 'большой' }];
      vocabularySource = 'combined';
      poolCount = allWords.length;
      poolLabel = `All words (${allWords.length})`;
    }

    const sampledWords = [...selectedPool].sort(() => 0.5 - Math.random()).slice(0, 30);
    const vocabListStr = sampledWords.map((w) => `${w.word} (${w.translation})`).join(', ');

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
    const prompt = `You are an elite English language professor.
Your task is to generate 10 full-sentence translation exercises for a student.

SELECTED GRAMMAR TOPIC(S):
${topicsStr}

STUDENT'S MASTERED VOCABULARY POOL (YOU MUST COMPOSE SENTENCES PRIMARILY USING THESE KNOWN WORDS):
${vocabListStr}

CRITICAL MANDATORY INSTRUCTIONS:
1. For each of the 10 tasks:
   - "sourceSentence": A natural Russian sentence for the student to translate into English.
   - "targetSentence": The perfect, accurate English translation.
   - "alternativeAnswers": Array of 1-3 valid alternative translations in English.
   - "testedGrammar": Name of the specific grammar topic tested in this sentence.
   - "usedVocabulary": Array of student vocabulary words embedded in this sentence.
   - "explanation": Detailed Russian explanation of the grammar rule, word order, auxiliary verbs, and why this translation is constructed this way.
2. The sentences MUST strictly practice the chosen grammar topics while weaving together words from the student's vocabulary list.
3. Provide progressive variety across the 10 sentences covering different persons (I, you, he/she, we, they), affirmative/negative/questions, and nuances.

Respond ONLY with valid JSON matching this exact schema:
{
  "exercises": [
    {
      "sourceSentence": "Русское предложение для перевода",
      "targetSentence": "Correct English translation",
      "alternativeAnswers": ["Alternative English translation 1"],
      "testedGrammar": "Grammar topic name",
      "usedVocabulary": ["word1", "word2"],
      "explanation": "Подробное объяснение грамматики и перевода на русском языке"
    }
  ]
}`;

    let exercises = [];
    const aiModels = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash-lite'];
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
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 12000))
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
        console.warn(`Translation generation error on English model ${m}:`, err.message);
      }
    }

    if (exercises.length === 0) {
      exercises = [
        {
          sourceSentence: "Они строят большой новый дом в центре города.",
          targetSentence: "They are building a big new house in the city center.",
          alternativeAnswers: ["They build a big new house in the city center."],
          testedGrammar: selectedTopicRows[0]?.name || "Present Continuous",
          usedVocabulary: ["house", "big", "new"],
          explanation: "Для действия, происходящего в данный период времени, используется Present Continuous (are building). Прилагательные 'big' и 'new' идут перед существительным."
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
    const userId = getUserId(req);
    const topicId = Number(req.params.id);
    const { score, isLocked } = req.body || {};

    const topic = db.prepare('SELECT * FROM curriculum_topics WHERE id = ?').get(topicId);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    let targetScore = typeof score === 'number' ? Math.max(0, Math.min(100, score)) : (isLocked ? 100 : 0);
    let targetStatus = targetScore >= 80 ? 'mastered' : (targetScore > 0 ? 'improving' : 'not_started');
    let targetLocked = isLocked !== undefined ? (isLocked ? 1 : 0) : (targetScore === 100 ? 1 : 0);
    if (targetScore === 0) targetLocked = 0;

    const existing = db.prepare('SELECT * FROM user_topic_progress WHERE curriculum_topic_id = ? AND user_id = ?').get(topicId, userId);
    if (existing) {
      db.prepare(`
        UPDATE user_topic_progress
        SET score = ?, status = ?, is_locked = ?, last_practiced = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE curriculum_topic_id = ? AND user_id = ?
      `).run(targetScore, targetStatus, targetLocked, topicId, userId);
    } else {
      db.prepare(`
        INSERT INTO user_topic_progress (curriculum_topic_id, user_id, score, status, is_locked, success_count, error_count, last_practiced)
        VALUES (?, ?, ?, ?, ?, 0, 0, CURRENT_TIMESTAMP)
      `).run(topicId, userId, targetScore, targetStatus, targetLocked);
    }

    res.json({ success: true, topicId, score: targetScore, status: targetStatus, isLocked: targetLocked === 1 });
  } catch (error) {
    console.error('Error in /api/topics/:id/set-score:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получение всех слов
app.get('/api/vocabulary', (req, res) => {
  try {
    const userId = getUserId(req);
    const words = db.prepare('SELECT * FROM vocabulary WHERE user_id = ? ORDER BY learned_permanently_at IS NOT NULL ASC, next_review ASC').all(userId);
    
    let groupRows = [];
    try {
      groupRows = db.prepare(`
        SELECT gm.vocabulary_id, g.id AS group_id, g.name AS group_name
        FROM vocabulary_group_members gm
        JOIN vocabulary_groups g ON g.id = gm.group_id
        WHERE g.user_id = ?
        ORDER BY g.name COLLATE NOCASE ASC
      `).all(userId);
    } catch (e) {}

    const groupsByWordId = new Map();
    for (const grow of groupRows) {
      if (!groupsByWordId.has(grow.vocabulary_id)) {
        groupsByWordId.set(grow.vocabulary_id, []);
      }
      groupsByWordId.get(grow.vocabulary_id).push({ id: grow.group_id, name: grow.group_name });
    }

    const enhancedWords = words.map((w) => {
      const wGroups = groupsByWordId.get(w.id) || [];
      return {
        ...w,
        groups: wGroups,
        group_ids: wGroups.map((g) => g.id),
      };
    });

    res.json({ words: enhancedWords });
  } catch (error) {
    console.error('Error fetching vocabulary:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получение слов на повторение сегодня
app.get('/api/vocabulary/due', (req, res) => {
  try {
    const userId = getUserId(req);
    const today = new Date().toISOString().split('T')[0];
    const words = db.prepare('SELECT * FROM vocabulary WHERE user_id = ? AND learned_permanently_at IS NULL AND next_review <= ? ORDER BY next_review ASC').all(userId, today + 'T23:59:59');
    res.json({ words });
  } catch (error) {
    console.error('Error fetching due words:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/vocabulary/study-session', (req, res) => {
  try {
    const requestedMode = typeof req.query?.mode === 'string' ? req.query.mode.trim() : '';
    const isGroupMode = requestedMode.startsWith('group:') || requestedMode.startsWith('groups:');
    if (requestedMode && !RESUMABLE_VOCABULARY_MODES.has(requestedMode) && !isGroupMode) {
      return res.status(400).json({ error: 'mode must be once_all, favorites, group:<id>, or groups:<ids>' });
    }
    const row = db.prepare(`
      SELECT mode, queue_json, round_total, updated_at
      FROM vocabulary_study_sessions
      WHERE user_id = ?
        AND (? = '' OR mode = ?)
      ORDER BY updated_at DESC, mode ASC
      LIMIT 1
    `).get(getUserId(req), requestedMode, requestedMode);
    if (!row) return res.json({ session: null });
    res.json({ session: { mode: row.mode, queueIds: JSON.parse(row.queue_json), roundTotal: row.round_total, updatedAt: row.updated_at } });
  } catch (error) {
    console.error('Error fetching vocabulary study session:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/vocabulary/study-session', (req, res) => {
  try {
    const userId = getUserId(req);
    const session = validateVocabularyStudySession(userId, req.body || {});
    const updatedAt = new Date().toISOString();
    const saveSession = db.transaction(() => {
      const existing = db.prepare(`
        SELECT queue_json
        FROM vocabulary_study_sessions
        WHERE user_id = ? AND mode = ?
      `).get(userId, session.mode);
      const isGroupMode = session.mode.startsWith('group:') || session.mode.startsWith('groups:');
      if (existing && req.body?.restart !== true && !isGroupMode) {
        const previousQueue = JSON.parse(existing.queue_json);
        if (Array.isArray(previousQueue) && session.queueIds.length > previousQueue.length) {
          const error = new Error('A newer exact-once position is already saved. Explicit restart is required to increase the queue.');
          error.status = 409;
          error.code = 'STUDY_SESSION_REGRESSION';
          throw error;
        }
      }
      db.prepare(`
        INSERT INTO vocabulary_study_sessions (user_id, mode, queue_json, round_total, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, mode) DO UPDATE SET
          queue_json = excluded.queue_json,
          round_total = excluded.round_total,
          updated_at = excluded.updated_at
      `).run(userId, session.mode, JSON.stringify(session.queueIds), session.roundTotal, updatedAt);
    });
    saveSession();
    res.json({ session: { ...session, updatedAt } });
  } catch (error) {
    console.error('Error saving vocabulary study session:', error);
    res.status(error.status || 500).json({ error: error.message, code: error.code });
  }
});

// Добавление нового слова
app.post('/api/vocabulary', (req, res) => {
  try {
    const userId = getUserId(req);
    const { word, translation, example } = req.body;
    const norm = String(word || '').trim().toLowerCase();
    
    const existing = db.prepare('SELECT id FROM vocabulary WHERE user_id = ? AND normalized_word = ?').get(userId, norm);
    if (existing) {
      return res.status(400).json({ error: 'Word already exists' });
    }
    
    const result = db.prepare(`
      INSERT INTO vocabulary (user_id, word, normalized_word, translation, example, level, next_review)
      VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `).run(userId, String(word).trim(), norm, translation, example || null);
    
    const newWordId = result.lastInsertRowid;
    if (Array.isArray(req.body?.groupIds) && req.body.groupIds.length > 0) {
      try {
        const insertMember = db.prepare('INSERT OR IGNORE INTO vocabulary_group_members (group_id, vocabulary_id) VALUES (?, ?)');
        for (const gid of req.body.groupIds) {
          const exists = db.prepare('SELECT id FROM vocabulary_groups WHERE id = ? AND user_id = ?').get(Number(gid), userId);
          if (exists) insertMember.run(Number(gid), newWordId);
        }
      } catch (e) {}
    }
    const newWord = db.prepare('SELECT * FROM vocabulary WHERE id = ?').get(newWordId);
    res.json(newWord);
  } catch (error) {
    console.error('Error adding word:', error);
    res.status(500).json({ error: error.message });
  }
});

// Обновление прогресса слова (после повторения)
app.post('/api/vocabulary/:id/review', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { quality, nextReview, interval } = req.body;
    
    const word = db.prepare('SELECT * FROM vocabulary WHERE id = ? AND user_id = ?').get(id, userId);
    if (!word) {
      return res.status(404).json({ error: 'Word not found' });
    }
    if (word.learned_permanently_at) {
      return res.status(409).json({ error: 'Restore this permanently learned word before reviewing it', code: 'VOCAB_LEARNED_PERMANENTLY' });
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
    
    const qualityNumber = Number(quality);
    if (![0, 1, 2, 3].includes(qualityNumber)) {
      return res.status(400).json({ error: 'quality must be 0, 1, 2, or 3' });
    }
    const fallbackDays = [0, 1, 3, 7][qualityNumber];
    const fallbackNextReview = new Date(Date.now() + fallbackDays * 24 * 60 * 60 * 1000).toISOString();
    const safeNextReview = typeof nextReview === 'string' && !Number.isNaN(Date.parse(nextReview)) ? nextReview : fallbackNextReview;

    db.prepare(`
      UPDATE vocabulary 
      SET level = ?,
          next_review = ?,
          review_count = review_count + 1,
          last_reviewed = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(newLevel, safeNextReview, id, userId);
    
    const updatedWord = db.prepare('SELECT * FROM vocabulary WHERE id = ? AND user_id = ?').get(id, userId);
    res.json(updatedWord);
  } catch (error) {
    console.error('Error reviewing word:', error);
    res.status(500).json({ error: error.message });
  }
});

// Обновление карточки слова
app.put('/api/vocabulary/:id', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM vocabulary WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) {
      return res.status(404).json({ error: 'Word not found' });
    }
    const { word, translation, example, level } = req.body || {};
    const wordStr = word !== undefined ? String(word).trim() : existing.word;
    const norm = wordStr.toLowerCase();
    const transStr = translation !== undefined ? String(translation).trim() : existing.translation;
    const exStr = example !== undefined ? String(example).trim() : existing.example;
    const levelNum = level !== undefined ? Number(level) : existing.level;

    db.prepare(`
      UPDATE vocabulary
      SET word = ?, normalized_word = ?, translation = ?, example = ?, level = ?
      WHERE id = ? AND user_id = ?
    `).run(wordStr, norm, transStr, exStr, levelNum, id, userId);

    const updated = db.prepare('SELECT * FROM vocabulary WHERE id = ? AND user_id = ?').get(id, userId);
    res.json(updated);
  } catch (error) {
    console.error('Error updating word:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/vocabulary/:id/favorite', (req, res) => {
  try {
    const userId = getUserId(req);
    if (typeof req.body?.favorite !== 'boolean') {
      return res.status(400).json({ error: 'favorite must be a boolean' });
    }
    const result = db.prepare('UPDATE vocabulary SET is_favorite = ? WHERE id = ? AND user_id = ?')
      .run(req.body.favorite ? 1 : 0, req.params.id, userId);
    if (result.changes === 0) return res.status(404).json({ error: 'Word not found' });
    res.json(db.prepare('SELECT * FROM vocabulary WHERE id = ? AND user_id = ?').get(req.params.id, userId));
  } catch (error) {
    console.error('Error updating favorite:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/vocabulary/:id/permanent-learned', (req, res) => {
  try {
    const userId = getUserId(req);
    if (typeof req.body?.learned !== 'boolean') {
      return res.status(400).json({ error: 'learned must be a boolean' });
    }
    const learned = req.body.learned;
    const timestamp = learned ? new Date().toISOString() : null;
    db.transaction(() => {
      const result = db.prepare(`
        UPDATE vocabulary 
        SET learned_permanently_at = ?,
            is_favorite = CASE WHEN ? = 1 THEN 0 ELSE is_favorite END
        WHERE id = ? AND user_id = ?
      `).run(timestamp, learned ? 1 : 0, req.params.id, userId);
      if (result.changes === 0) throw new Error('Word not found');
      if (learned) {
        db.prepare('DELETE FROM vocabulary_group_members WHERE vocabulary_id = ?').run(req.params.id);
      }
    })();
    res.json(db.prepare('SELECT * FROM vocabulary WHERE id = ? AND user_id = ?').get(req.params.id, userId));
  } catch (error) {
    console.error('Error updating permanent learned state:', error);
    res.status(500).json({ error: error.message });
  }
});

// Удаление слова
app.delete('/api/vocabulary/:id', (req, res) => {
  try {
    const userId = getUserId(req);
    const result = db.prepare('DELETE FROM vocabulary WHERE id = ? AND user_id = ?').run(req.params.id, userId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Word not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting word:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== CURRICULUM API ====================

// Get all curriculum topics with progress
app.get('/api/curriculum', (req, res) => {
  try {
    const userId = getUserId(req);
    const settings = db.prepare('SELECT max_level FROM user_settings WHERE user_id = ?').get(userId) || { max_level: 'B2' };
    const topics = db.prepare(`
      SELECT c.id, c.name, c.category, c.level, c.source, c.created_at,
             COALESCE(p.status, 'not_started') as status,
             COALESCE(p.score, 0) as score,
             COALESCE(p.success_count, 0) as success_count,
             COALESCE(p.error_count, 0) as failure_count,
             COALESCE(p.unique_practice_days, 0) as unique_practice_days,
             p.last_practiced,
             p.last_error_at,
             p.last_success_at
      FROM curriculum_topics c
      LEFT JOIN user_topic_progress p ON c.id = p.curriculum_topic_id AND p.user_id = ?
      ORDER BY c.level, c.category, c.name
    `).all(userId);

    for (const t of topics) {
      t.mastery_confidence = calculateMasteryConfidence({
        score: t.score,
        success_count: t.success_count,
        error_count: t.failure_count,
        unique_practice_days: t.unique_practice_days,
        last_error_at: t.last_error_at,
        last_success_at: t.last_success_at,
      });
    }

    res.json({ topics, maxLevel: settings.max_level });
  } catch (error) {
    console.error('Error fetching curriculum:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Получение статистики
app.get('/api/stats', (req, res) => {
  try {
    const userId = getUserId(req);
    const topicsCount = db.prepare("SELECT COUNT(*) as count FROM user_topic_progress WHERE user_id = ? AND status != 'not_started'").get(userId).count;
    const topicsLowScore = db.prepare("SELECT COUNT(*) as count FROM user_topic_progress WHERE user_id = ? AND status != 'not_started' AND score < 30").get(userId).count;
    const topicsHighScore = db.prepare("SELECT COUNT(*) as count FROM user_topic_progress WHERE user_id = ? AND score >= 70").get(userId).count;
    
    const byStatus = {
      insufficient_evidence: db.prepare("SELECT COUNT(*) as count FROM user_topic_progress WHERE user_id = ? AND status = 'insufficient_evidence'").get(userId).count,
      improving: db.prepare("SELECT COUNT(*) as count FROM user_topic_progress WHERE user_id = ? AND status = 'improving'").get(userId).count,
      recurring_problem: db.prepare("SELECT COUNT(*) as count FROM user_topic_progress WHERE user_id = ? AND status = 'recurring_problem'").get(userId).count,
      stable: db.prepare("SELECT COUNT(*) as count FROM user_topic_progress WHERE user_id = ? AND status = 'stable'").get(userId).count,
      mastered: db.prepare("SELECT COUNT(*) as count FROM user_topic_progress WHERE user_id = ? AND status = 'mastered'").get(userId).count,
    };

    const vocabTotal = db.prepare('SELECT COUNT(*) as count FROM vocabulary WHERE user_id = ?').get(userId).count;
    const today = new Date().toISOString().split('T')[0];
    const vocabDue = db.prepare('SELECT COUNT(*) as count FROM vocabulary WHERE user_id = ? AND next_review <= ?').get(userId, today + 'T23:59:59').count;
    const vocabMastered = db.prepare('SELECT COUNT(*) as count FROM vocabulary WHERE user_id = ? AND review_count >= 5 AND level >= 2').get(userId).count;
    
    const chatMessages = db.prepare('SELECT COUNT(*) as count FROM chat_history WHERE user_id = ?').get(userId).count;
    
    res.json({
      topics: {
        total: topicsCount,
        needsPractice: topicsLowScore,
        mastered: topicsHighScore,
        byStatus,
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

async function fetchHpmorChapterHtml(chapterNumber) {
  if (hpmorChapterHtmlCache.has(chapterNumber)) {
    return hpmorChapterHtmlCache.get(chapterNumber);
  }

  const response = await fetch(`https://hpmor.com/chapter/${chapterNumber}`, {
    headers: {
      'User-Agent': 'LinguaLearn Sync Reader/1.0',
    },
  });

  if (!response.ok) {
    const error = new Error(`Failed to fetch HPMOR chapter ${chapterNumber}.`);
    error.statusCode = response.status === 404 ? 404 : 502;
    throw error;
  }

  const html = await response.text();
  hpmorChapterHtmlCache.set(chapterNumber, html);
  return html;
}

async function fetchHpmorPodcastHtml() {
  if (hpmorPodcastHtmlCache) {
    return hpmorPodcastHtmlCache;
  }

  const response = await fetch('https://hpmorpodcast.com/?page_id=56', {
    headers: {
      'User-Agent': 'LinguaLearn Sync Reader/1.0',
    },
  });

  if (!response.ok) {
    const error = new Error('Failed to fetch the HPMOR podcast index.');
    error.statusCode = response.status === 404 ? 404 : 502;
    throw error;
  }

  const html = await response.text();
  hpmorPodcastHtmlCache = html;
  return html;
}

async function fetchHpmorPodcastPostHtml(url) {
  if (hpmorPodcastPostHtmlCache.has(url)) {
    return hpmorPodcastPostHtmlCache.get(url);
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'LinguaLearn Sync Reader/1.0',
    },
  });

  if (!response.ok) {
    const error = new Error('Failed to fetch the HPMOR podcast episode page.');
    error.statusCode = response.status === 404 ? 404 : 502;
    throw error;
  }

  const html = await response.text();
  hpmorPodcastPostHtmlCache.set(url, html);
  return html;
}

const HPMOR_ATTRIBUTION = "Harry Potter and the Methods of Rationality by Eliezer Yudkowsky (hpmor.com). Podcast audiobook by Eneasz Brodski (hpmorpodcast.com).";
const HPMOR_SOURCE_CREDITS = {
  author: "Eliezer Yudkowsky",
  website: "https://hpmor.com",
  podcast: "Eneasz Brodski (hpmorpodcast.com)",
  license: "Fanfiction / Open Creative Commons attribution",
  section: "Labs",
};

async function handleHpmorChapterRequest(req, res) {
  try {
    const chapterParam = req.params.chapterNumber || req.params.id;
    const chapterNumber = Number.parseInt(chapterParam, 10);
    const importMode = String(req.get('x-lingualearn-import-mode') || 'rough').toLowerCase();

    if (!Number.isInteger(chapterNumber)) {
      return res.status(400).json({ error: 'Chapter number must be an integer.' });
    }

    const chapterImport = await buildHpmorChapterImport({
      chapterNumber,
      fetchChapterHtml: fetchHpmorChapterHtml,
      fetchPodcastHtml: fetchHpmorPodcastHtml,
      fetchPodcastPostHtml: fetchHpmorPodcastPostHtml,
    });

    const responsePayload = {
      ...chapterImport,
      attribution: HPMOR_ATTRIBUTION,
      source_credits: HPMOR_SOURCE_CREDITS,
      section: 'Labs',
    };

    if (importMode === 'timed') {
      const transcriptImport = await transcribeAudioLocally({
        audioUrl: chapterImport.audioUrl,
        audioLabel: chapterImport.audioLabel,
        estimatedWindow: chapterImport.estimatedWindow,
        audioDurationEstimate: chapterImport.audioDurationEstimate,
        restrictToWindow: chapterImport.audioSourceType !== 'episode',
      });

      return res.json({
        ...responsePayload,
        ...transcriptImport,
      });
    }

    res.json(responsePayload);
  } catch (error) {
    console.error('Error importing HPMOR chapter:', error);
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    res.status(statusCode).json({ error: error.message });
  }
}

app.get('/api/reader/hpmor/chapters', (req, res) => {
  res.json({
    totalChapters: 122,
    attribution: HPMOR_ATTRIBUTION,
    source_credits: HPMOR_SOURCE_CREDITS,
    section: 'Labs',
  });
});

app.get('/api/reader/hpmor/chapters/:id', handleHpmorChapterRequest);
app.get('/api/reader/hpmor/chapter/:chapterNumber', handleHpmorChapterRequest);

app.post('/api/reader/transcribe-url', async (req, res) => {
  try {
    const { audioUrl, audioName } = req.body || {};
    if (typeof audioUrl !== 'string' || !audioUrl.trim()) {
      return res.status(400).json({ error: 'Provide an audioUrl for local transcription.' });
    }

    const transcriptImport = await transcribeAudioLocally({
      audioUrl: audioUrl.trim(),
      audioLabel: typeof audioName === 'string' && audioName.trim() ? audioName.trim() : 'Remote audio URL',
      restrictToWindow: false,
    });

    res.json(transcriptImport);
  } catch (error) {
    console.error('Error transcribing reader audio URL locally:', error);
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    res.status(statusCode).json({ error: error.message });
  }
});

app.post(
  '/api/reader/transcribe-upload',
  express.raw({
    type: () => true,
    limit: '250mb',
  }),
  async (req, res) => {
    try {
      const audioBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
      if (!audioBuffer.length) {
        return res.status(400).json({ error: 'Upload an audio file for local transcription.' });
      }

      const audioName = String(req.get('x-lingualearn-audio-name') || 'Uploaded audio').trim() || 'Uploaded audio';
      const transcriptImport = await transcribeAudioLocally({
        audioBuffer,
        fileName: audioName,
        audioLabel: audioName,
        restrictToWindow: false,
      });

      res.json(transcriptImport);
    } catch (error) {
      console.error('Error transcribing uploaded reader audio locally:', error);
      const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
      res.status(statusCode).json({ error: error.message });
    }
  },
);

app.post('/api/reader/translate', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!ensureGeminiAvailable(res, ['readerTranslation'])) {
    return;
  }

  try {
    const { title, segments, lines, words, targetWords } = req.body || {};
    if ((!Array.isArray(lines) || !lines.length) && (!Array.isArray(segments) || !segments.length) && (!Array.isArray(words) || !words.length)) {
      return res
        .status(400)
        .json({ error: 'Provide a non-empty lines array for translation.' });
    }

    let translations = [];
    if ((Array.isArray(lines) && lines.length) || (Array.isArray(segments) && segments.length)) {
      translations = await translateSegmentsWithGemini({
        genAI,
        title: typeof title === 'string' ? title : '',
        lines: Array.isArray(lines) ? lines : null,
        segments,
        targetLanguage: 'Russian',
      });
    }

    const wordsToSave = Array.isArray(words) ? words : (Array.isArray(targetWords) ? targetWords : []);
    let savedCount = 0;
    for (const item of wordsToSave) {
      const wordText = typeof item === 'string' ? item : item?.word;
      const trText = typeof item === 'object' && item?.translation_ru ? item.translation_ru : (typeof item === 'object' ? item?.translation || '' : '');
      const exText = typeof item === 'object' ? item?.example || null : null;
      if (wordText && typeof wordText === 'string' && wordText.trim()) {
        const norm = wordText.trim().toLowerCase();
        const existing = db.prepare('SELECT id FROM vocabulary WHERE user_id = ? AND normalized_word = ?').get(userId, norm);
        if (!existing) {
          db.prepare(`
            INSERT INTO vocabulary (user_id, word, normalized_word, translation, example, level, next_review, source)
            VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, 'reader_translate')
          `).run(userId, wordText.trim(), norm, trText, exText);
          savedCount += 1;
        }
      }
    }

    res.json({
      translations,
      translation_ru: Array.isArray(translations) ? translations.join('\n') : '',
      words: wordsToSave,
      saved_words_count: savedCount,
    });
  } catch (error) {
    console.error('Error translating reader segments:', error);
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    res.status(statusCode).json({ error: error.message });
  }
});

app.use((error, req, res, next) => {
  if (!error) {
    next();
    return;
  }

  if (res.headersSent) {
    next(error);
    return;
  }

  const statusCode =
    Number.isInteger(error.statusCode) ? error.statusCode :
    Number.isInteger(error.status) ? error.status :
    error.type === 'entity.parse.failed' ? 400 :
    error.type === 'entity.too.large' ? 413 :
    500;

  const message =
    error.type === 'entity.parse.failed'
      ? 'Reader API received invalid JSON.'
      : error.type === 'entity.too.large'
        ? 'Reader API request body is too large.'
        : error.message || 'Reader API request failed.';

  console.error('Reader API middleware error:', error);
  res.status(statusCode).json({ error: message });
});

export function startServer() {
  const httpServer = app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on http://${HOST}:${PORT}`);

    // Mount the realtime voice-chat WebSocket endpoint. Each browser connection
    // owns one Gemini Live API session and shares the SAME persistence layer as
    // the text chat (chat_history, curriculum_topics, vocabulary), so voice and
    // text mode stay perfectly in sync.
    if (geminiEnabled) {
      attachLiveChatBridge({
        server: httpServer,
        path: '/api/live-chat',
        db,
        getLiveContext: (userIdInput) => {
          // Same DB reads as getTopicsContext(), but returns structured data so
          // the Live API module can format it cleanly (without the text-chat
          // tag references that destabilise the native-audio model).
          const userId = userIdInput || 1;
          const settings = db.prepare('SELECT max_level FROM user_settings WHERE user_id = ?').get(userId);
          const maxLevel = settings?.max_level || 'B2';
          const maxLevelPriority = LEVEL_PRIORITY[maxLevel] || 1;
          const activeTopics = db
            .prepare(`
              SELECT c.name, c.category, c.level, p.score, p.success_count, p.error_count as failure_count
              FROM curriculum_topics c
              JOIN user_topic_progress p ON c.id = p.curriculum_topic_id AND p.user_id = ?
              WHERE p.status != 'not_started'
              ORDER BY p.score ASC, c.level DESC
            `)
            .all(userId)
            .filter((t) => LEVEL_PRIORITY[t.level] >= maxLevelPriority);
          const curriculumNames = db.prepare('SELECT name, level, category FROM curriculum_topics ORDER BY level, category').all();
          const curriculumByLevel = {};
          for (const ct of curriculumNames) {
            if (!curriculumByLevel[ct.level]) curriculumByLevel[ct.level] = [];
            curriculumByLevel[ct.level].push(ct.name);
          }
          return { maxLevel, activeTopics, curriculumByLevel };
        },
        updateTopicFromCall: (args, userIdInput) => updateTopic(args.topic, args.category, args.level, args.success, userIdInput),
        addVocabularyFromCall: (args, userIdInput) => {
          if (!args || !args.word || !args.translation) return null;
          const userId = userIdInput || 1;
          const norm = String(args.word).trim().toLowerCase();
          const existing = db.prepare('SELECT id FROM vocabulary WHERE user_id = ? AND normalized_word = ?').get(userId, norm);
          if (!existing) {
            db.prepare(`
              INSERT INTO vocabulary (user_id, word, normalized_word, translation, example, level, next_review)
              VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
            `).run(userId, String(args.word).trim(), norm, args.translation, args.example || null);
          }
          return { word: args.word, translation: args.translation, example: args.example || null, isNew: !existing };
        },
        geminiApiKey,
      });
    } else {
      console.warn('⚠️ Voice chat disabled: GEMINI_API_KEY not configured.');
    }
  });

  return httpServer;
}

const invokedAsMainModule = Boolean(process.argv[1]) && resolve(process.argv[1]) === __filename;
if (invokedAsMainModule && process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app, db, writingAnalysisService, databasePath };
