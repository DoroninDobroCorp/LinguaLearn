import Database from 'better-sqlite3';
import fs from 'fs';

// ============================================
// 1. SPANISH TOPICS ENRICHMENT
// ============================================
const spanishDb = new Database('/srv/LinguaLearn/spanish/server/spanish_learning.db');

const NEW_SPANISH_TOPICS = [
  // A2
  { name: 'Perífrasis de infinitivo (empezar a / terminar de / volver a / ir a)', category: 'Grammar', level: 'A2' },
  { name: 'Dialects: Spain vs Latin America (vosotros vs ustedes, vocabulary)', category: 'Speaking', level: 'A2' },
  
  // B1
  { name: 'Perífrasis de gerundio (seguir / continuar + gerundio, llevar + tiempo)', category: 'Grammar', level: 'B1' },
  { name: 'Perífrasis modales (dejar de / ponerse a / haber que + infinitivo)', category: 'Grammar', level: 'B1' },
  { name: 'Regional variations: Voseo and Rioplatense / Central American Spanish', category: 'Speaking', level: 'B1' },

  // B2
  { name: 'Perífrasis verbales avanzadas (ir/venir/andar + gerundio)', category: 'Grammar', level: 'B2' },
  { name: 'Perífrasis de participio (tener/dar por/dejar + participio)', category: 'Grammar', level: 'B2' },
  { name: 'Dialectal grammar: Leísmo, laísmo, loísmo and regional pronouns', category: 'Grammar', level: 'B2' }
];

const insertSpanishTopic = spanishDb.prepare(
  'INSERT OR IGNORE INTO curriculum_topics (name, category, level, source) VALUES (?, ?, ?, ?)'
);

for (const t of NEW_SPANISH_TOPICS) {
  insertSpanishTopic.run(t.name, t.category, t.level, 'preset');
}

console.log('Spanish topics inserted. Total topics now:', spanishDb.prepare('SELECT count(*) as count FROM curriculum_topics').get().count);

// Update spanish/server/index.js CURRICULUM_DATA
const spanishServerPath = '/srv/LinguaLearn/spanish/server/index.js';
let sCode = fs.readFileSync(spanishServerPath, 'utf8');

for (const t of NEW_SPANISH_TOPICS) {
  if (!sCode.includes(`name: '${t.name}'`)) {
    const entry = `  { name: '${t.name}', category: '${t.category}', level: '${t.level}' },\n`;
    // Insert under appropriate level
    if (t.level === 'A2') {
      sCode = sCode.replace("// ===== A2 - Elementary =====", `// ===== A2 - Elementary =====\n${entry}`);
    } else if (t.level === 'B1') {
      sCode = sCode.replace("// ===== B1 - Intermediate =====", `// ===== B1 - Intermediate =====\n${entry}`);
    } else if (t.level === 'B2') {
      sCode = sCode.replace("// ===== B2 - Upper Intermediate =====", `// ===== B2 - Upper Intermediate =====\n${entry}`);
    }
  }
}
fs.writeFileSync(spanishServerPath, sCode, 'utf8');
console.log('Updated CURRICULUM_DATA in spanish/server/index.js');


// ============================================
// 2. ENGLISH TOPICS ENRICHMENT
// ============================================
const englishDb = new Database('/srv/LinguaLearn/english/server/english_learning.db');

const NEW_ENGLISH_TOPICS = [
  // A2
  { name: 'Phrasal verbs: movement & daily actions (wake up, get on, turn off)', category: 'Grammar', level: 'A2' },
  { name: 'American vs British English (vocabulary & basic spelling differences)', category: 'Speaking', level: 'A2' },

  // B1
  { name: 'Phrasal verbs: communication & emotions (bring up, get along, break up)', category: 'Grammar', level: 'B1' },
  { name: 'Used to vs Would vs Be used to (past habits and familiarity)', category: 'Grammar', level: 'B1' },
  { name: 'American vs British syntax (have got vs have, past simple vs present perfect)', category: 'Speaking', level: 'B1' },

  // B2
  { name: 'Three-part phrasal verbs (look forward to, run out of, get rid of)', category: 'Grammar', level: 'B2' },
  { name: 'Causative structures (have/get something done)', category: 'Grammar', level: 'B2' },
  { name: 'Mixed conditionals & inverted conditionals (Had I known, Were you to)', category: 'Grammar', level: 'B2' },

  // C1
  { name: 'Negative inversion (Seldom have I, Not only... but also, No sooner had)', category: 'Grammar', level: 'C1' }
];

const insertEnglishTopic = englishDb.prepare(
  'INSERT OR IGNORE INTO curriculum_topics (name, category, level, source) VALUES (?, ?, ?, ?)'
);

for (const t of NEW_ENGLISH_TOPICS) {
  insertEnglishTopic.run(t.name, t.category, t.level, 'preset');
}

console.log('English topics inserted. Total topics now:', englishDb.prepare('SELECT count(*) as count FROM curriculum_topics').get().count);

// Update english/server/index.js CURRICULUM_DATA
const englishServerPath = '/srv/LinguaLearn/english/server/index.js';
let eCode = fs.readFileSync(englishServerPath, 'utf8');

for (const t of NEW_ENGLISH_TOPICS) {
  if (!eCode.includes(`name: '${t.name}'`)) {
    const entry = `  { name: '${t.name}', category: '${t.category}', level: '${t.level}' },\n`;
    if (t.level === 'A2') {
      eCode = eCode.replace("// ===== A2 - Elementary =====", `// ===== A2 - Elementary =====\n${entry}`);
    } else if (t.level === 'B1') {
      eCode = eCode.replace("// ===== B1 - Intermediate =====", `// ===== B1 - Intermediate =====\n${entry}`);
    } else if (t.level === 'B2') {
      eCode = eCode.replace("// ===== B2 - Upper Intermediate =====", `// ===== B2 - Upper Intermediate =====\n${entry}`);
    } else if (t.level === 'C1') {
      eCode = eCode.replace("// ===== C1 - Advanced =====", `// ===== C1 - Advanced =====\n${entry}`);
    }
  }
}
fs.writeFileSync(englishServerPath, eCode, 'utf8');
console.log('Updated CURRICULUM_DATA in english/server/index.js');
