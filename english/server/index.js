import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildHpmorChapterImport } from './hpmor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;
const hpmorChapterHtmlCache = new Map();

// Инициализация Gemini
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found in environment variables');
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Инициализация базы данных
const db = new Database(join(__dirname, 'english_learning.db'));

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

// Инициализация настроек пользователя
const initSettings = db.prepare('INSERT OR IGNORE INTO user_settings (id, max_level) VALUES (1, ?)');
initSettings.run('B2');

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

app.use(cors());
app.use(express.json());

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
function getTopicsContext() {
  const settings = db.prepare('SELECT max_level FROM user_settings WHERE id = 1').get();
  const maxLevelPriority = LEVEL_PRIORITY[settings.max_level] || 1;

  // Active topics (in_progress or mastered) from curriculum
  const activeTopics = db.prepare(
    "SELECT * FROM curriculum_topics WHERE status != 'not_started' ORDER BY score ASC, level DESC"
  ).all();
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

// API: Чат с ЛЛМ
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    // Сохранение сообщения пользователя
    db.prepare('INSERT INTO chat_history (role, content) VALUES (?, ?)').run('user', message);
    
    // Получение истории чата (последние 10 сообщений)
    const history = db.prepare('SELECT role, content FROM chat_history ORDER BY id DESC LIMIT 10').all().reverse();
    
    const systemPrompt = `You are a friendly and professional English language tutor. Your tasks:
1. Help the user learn English through natural dialogue IN ENGLISH ONLY
2. Give varied learning activities: casual chat, exercises, recommendations
3. Track mistakes and successes
4. After each user's answer to a task, evaluate it and report the result

${getTopicsContext()}

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
              const result = updateTopic(update.topic, update.category, update.level, update.success);
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
        const existing = db.prepare('SELECT id FROM vocabulary WHERE word = ?').get(vocab.word);
        if (!existing) {
          db.prepare(`
            INSERT INTO vocabulary (word, translation, example, level, next_review)
            VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
          `).run(vocab.word, vocab.translation, vocab.example || null);
        }
      } catch (e) {
        console.error('Error parsing vocab add:', e);
      }
    }
    
    // Удаление метаданных из ответа
    const cleanResponse = responseText
      .replace(/\[TOPICS_UPDATE: ({.*?})\]/s, '')
      .replace(/\[VOCAB_ADD: ({.*?})\]/s, '')
      .trim();
    
    // Сохранение ответа ассистента
    db.prepare('INSERT INTO chat_history (role, content) VALUES (?, ?)').run('assistant', cleanResponse);
    
    res.json({ 
      response: cleanResponse,
      topicChanges: topicChanges.length > 0 ? topicChanges : undefined
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Функция обновления темы — writes directly to curriculum_topics
function updateTopic(name, category, level, success) {
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
    const scoreChange = success ? 5 : -10;
    const newScore = Math.max(0, Math.min(100, existing.score + scoreChange));
    const newStatus = newScore >= 80 ? 'mastered' : 'in_progress';

    db.prepare(`
      UPDATE curriculum_topics 
      SET score = ?, status = ?,
          success_count = success_count + ?,
          failure_count = failure_count + ?,
          last_practiced = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newScore, newStatus, success ? 1 : 0, success ? 0 : 1, existing.id);

    return { 
      isNew: false, 
      name: existing.name, 
      scoreChange, 
      newScore: Math.round(newScore),
      success 
    };
  } else {
    // AI detected a new topic — add to curriculum_topics directly
    const initialScore = success ? 50 : 0;
    const status = 'in_progress';
    db.prepare(`
      INSERT INTO curriculum_topics (name, category, level, score, status, success_count, failure_count, source, last_practiced)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ai_detected', CURRENT_TIMESTAMP)
    `).run(name, category, level, initialScore, status, success ? 1 : 0, success ? 0 : 1);

    return { 
      isNew: true, 
      name, 
      category,
      level,
      success 
    };
  }
}

// API: Получение всех тем (reads from curriculum_topics for backward compatibility)
app.get('/api/topics', (req, res) => {
  try {
    const settings = db.prepare('SELECT max_level FROM user_settings WHERE id = 1').get();
    const maxLevelPriority = LEVEL_PRIORITY[settings.max_level] || 1;
    
    const topics = db.prepare(
      "SELECT * FROM curriculum_topics WHERE status != 'not_started' ORDER BY score ASC, level DESC"
    ).all();
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
    const { maxLevel, darkMode, notificationsEnabled } = req.body;
    
    if (maxLevel) {
      db.prepare('UPDATE user_settings SET max_level = ? WHERE id = 1').run(maxLevel);
    }
    if (darkMode !== undefined) {
      db.prepare('UPDATE user_settings SET dark_mode = ? WHERE id = 1').run(darkMode ? 1 : 0);
    }
    if (notificationsEnabled !== undefined) {
      db.prepare('UPDATE user_settings SET notifications_enabled = ? WHERE id = 1').run(notificationsEnabled ? 1 : 0);
    }
    
    const settings = db.prepare('SELECT * FROM user_settings WHERE id = 1').get();
    res.json(settings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Получение настроек
app.get('/api/settings', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM user_settings WHERE id = 1').get();
    res.json(settings || { max_level: 'B2', dark_mode: 0, notifications_enabled: 1 });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Ручное обновление темы
app.post('/api/topics/update', (req, res) => {
  const { topic, category, level, success } = req.body;
  updateTopic(topic, category, level, success);
  res.json({ success: true });
});

// API: Удаление/сброс темы
app.delete('/api/topics/:id', (req, res) => {
  const topic = db.prepare('SELECT * FROM curriculum_topics WHERE id = ?').get(req.params.id);
  if (topic && topic.source === 'ai_detected') {
    db.prepare('DELETE FROM curriculum_topics WHERE id = ?').run(req.params.id);
  } else if (topic) {
    // Preset topic — reset instead of delete
    db.prepare(
      "UPDATE curriculum_topics SET status = 'not_started', score = 0, success_count = 0, failure_count = 0, last_practiced = NULL WHERE id = ?"
    ).run(req.params.id);
  }
  res.json({ success: true });
});

// API: Получение истории чата
app.get('/api/chat/history', (req, res) => {
  try {
    const history = db.prepare('SELECT role, content, timestamp FROM chat_history ORDER BY id ASC').all();
    res.json({ history });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Очистка истории чата
app.delete('/api/chat/clear', (req, res) => {
  db.prepare('DELETE FROM chat_history').run();
  res.json({ success: true });
});

// ==================== VOCABULARY API ====================

// Получение всех слов
app.get('/api/vocabulary', (req, res) => {
  try {
    const words = db.prepare('SELECT * FROM vocabulary ORDER BY next_review ASC').all();
    res.json({ words });
  } catch (error) {
    console.error('Error fetching vocabulary:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получение слов на повторение сегодня
app.get('/api/vocabulary/due', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const words = db.prepare('SELECT * FROM vocabulary WHERE next_review <= ? ORDER BY next_review ASC').all(today + 'T23:59:59');
    res.json({ words });
  } catch (error) {
    console.error('Error fetching due words:', error);
    res.status(500).json({ error: error.message });
  }
});

// Добавление нового слова
app.post('/api/vocabulary', (req, res) => {
  try {
    const { word, translation, example } = req.body;
    
    // Проверка на существование
    const existing = db.prepare('SELECT id FROM vocabulary WHERE word = ?').get(word);
    if (existing) {
      return res.status(400).json({ error: 'Word already exists' });
    }
    
    const result = db.prepare(`
      INSERT INTO vocabulary (word, translation, example, level, next_review)
      VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
    `).run(word, translation, example || null);
    
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
    const { id } = req.params;
    const { quality, nextReview, interval } = req.body;
    
    const word = db.prepare('SELECT * FROM vocabulary WHERE id = ?').get(id);
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
      WHERE id = ?
    `).run(newLevel, nextReview, id);
    
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
    db.prepare('DELETE FROM vocabulary WHERE id = ?').run(req.params.id);
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
    const settings = db.prepare('SELECT max_level FROM user_settings WHERE id = 1').get();
    const topics = db.prepare(
      'SELECT * FROM curriculum_topics ORDER BY level, category, name'
    ).all();
    res.json({ topics, maxLevel: settings.max_level });
  } catch (error) {
    console.error('Error fetching curriculum:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Получение статистики
app.get('/api/stats', (req, res) => {
  try {
    const topicsCount = db.prepare("SELECT COUNT(*) as count FROM curriculum_topics WHERE status != 'not_started'").get().count;
    const topicsLowScore = db.prepare("SELECT COUNT(*) as count FROM curriculum_topics WHERE status != 'not_started' AND score < 30").get().count;
    const topicsHighScore = db.prepare("SELECT COUNT(*) as count FROM curriculum_topics WHERE score >= 70").get().count;
    
    const vocabTotal = db.prepare('SELECT COUNT(*) as count FROM vocabulary').get().count;
    const today = new Date().toISOString().split('T')[0];
    const vocabDue = db.prepare('SELECT COUNT(*) as count FROM vocabulary WHERE next_review <= ?').get(today + 'T23:59:59').count;
    const vocabMastered = db.prepare('SELECT COUNT(*) as count FROM vocabulary WHERE review_count >= 5 AND level >= 2').get().count;
    
    const chatMessages = db.prepare('SELECT COUNT(*) as count FROM chat_history').get().count;
    
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

app.get('/api/reader/hpmor/chapter/:chapterNumber', async (req, res) => {
  try {
    const chapterNumber = Number.parseInt(req.params.chapterNumber, 10);

    if (!Number.isInteger(chapterNumber)) {
      return res.status(400).json({ error: 'Chapter number must be an integer.' });
    }

    const chapterImport = await buildHpmorChapterImport({
      chapterNumber,
      fetchChapterHtml: fetchHpmorChapterHtml,
    });

    res.json(chapterImport);
  } catch (error) {
    console.error('Error importing HPMOR chapter:', error);
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    res.status(statusCode).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
