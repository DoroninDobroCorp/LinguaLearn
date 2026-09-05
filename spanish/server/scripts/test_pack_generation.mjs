import Database from 'better-sqlite3';

const DB_PATH = '/srv/LinguaLearn/spanish/server/spanish_learning.db';
const db = new Database(DB_PATH);

const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
console.log("API Key present:", Boolean(apiKey));

// Fetch first 18 topics of A1
const topics = db.prepare(`
  SELECT id, pedagogical_order, name, category, level 
  FROM curriculum_topics 
  WHERE level = 'A1' 
  ORDER BY pedagogical_order ASC, id ASC 
  LIMIT 18
`).all();

console.log(`Loaded ${topics.length} topics:`);
topics.forEach(t => console.log(`  ${t.pedagogical_order}. [${t.id}] ${t.name}`));
