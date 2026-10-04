import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVocabularyTextKey } from '../unicodeKeys.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || '/srv/LinguaLearn/spanish/server/spanish_learning.db';

console.log(`Using DB: ${DB_PATH}`);
const db = new Database(DB_PATH);

const GOD_PROFILE_ID = 6;
const MAYA_PROFILE_ID = 9;
const ALMOST_LEARNED_GROUP_ID = 6; // Group 6 = "Почти выучил 1" (canonical almost learned group)
const DEFAULT_EASE_FACTOR = 2.3;
const now = new Date().toISOString();

function cleanKey(text) {
  if (!text) return '';
  let str = text.normalize('NFD').toLowerCase();
  str = str.replace(/[\u0300-\u036f]/g, '');
  for (const art of ['el ', 'la ', 'los ', 'las ', 'un ', 'una ', 'unos ', 'unas ']) {
    if (str.startsWith(art)) {
      str = str.slice(art.length);
    }
  }
  for (const ch of ['¡', '!', '¿', '?', '(', ')', '/', ',', '.', ':']) {
    str = str.replace(ch, '');
  }
  return str.trim();
}

const EXACT_OVERRIDE = {
  'sí': 2050,
  'el papá': 1596,
  'papá': 1596,
  'si': 2050,
};

const run = db.transaction(() => {
  // 1. Verify God profile and group
  const godProfile = db.prepare('SELECT id, name FROM profiles WHERE id = ?').get(GOD_PROFILE_ID);
  if (!godProfile) throw new Error(`God profile ${GOD_PROFILE_ID} not found`);

  const group = db.prepare('SELECT id, name FROM vocabulary_groups WHERE id = ? AND profile_id = ?').get(ALMOST_LEARNED_GROUP_ID, GOD_PROFILE_ID);
  if (!group) throw new Error(`Group ${ALMOST_LEARNED_GROUP_ID} not found for profile ${GOD_PROFILE_ID}`);

  console.log(`Target: Profile ${godProfile.name} (ID: ${godProfile.id}), Group: "${group.name}" (ID: ${group.id})\n`);

  // 2. Add / Update "tarjeta"
  let tarjeta = db.prepare('SELECT id, word, translation FROM vocabulary WHERE profile_id = ? AND (word = ? OR word_key = ?)').get(GOD_PROFILE_ID, 'tarjeta', 'tarjeta');
  let tarjetaId;
  if (tarjeta) {
    tarjetaId = tarjeta.id;
    db.prepare(`
      UPDATE vocabulary
      SET translation = 'карта / карточка (банковская)',
          translation_key = ?,
          example = '¿Puedo pagar con tarjeta de crédito?',
          example_translation = 'Могу ли я расплатиться кредитной картой?',
          part_of_speech = 'noun',
          gender = 'f',
          learned_permanently_at = NULL
      WHERE id = ?
    `).run(buildVocabularyTextKey('карта / карточка (банковская)'), tarjetaId);
    console.log(`[TARJETA] Updated existing word ID ${tarjetaId}: "tarjeta" -> "карта / карточка (банковская)"`);
  } else {
    const res = db.prepare(`
      INSERT INTO vocabulary (
        profile_id, word, word_key, translation, translation_key,
        example, example_translation, part_of_speech, gender, level
      ) VALUES (?, 'tarjeta', 'tarjeta', 'карта / карточка (банковская)', ?, '¿Puedo pagar con tarjeta de crédito?', 'Могу ли я расплатиться кредитной картой?', 'noun', 'f', 1)
    `).run(GOD_PROFILE_ID, buildVocabularyTextKey('карта / карточка (банковская)'));
    tarjetaId = res.lastInsertRowid;
    console.log(`[TARJETA] Inserted new word ID ${tarjetaId}: "tarjeta"`);
  }

  // Ensure review cards for tarjeta
  for (const dir of ['source_to_target', 'target_to_source']) {
    const card = db.prepare('SELECT id FROM vocabulary_review_cards WHERE vocabulary_id = ? AND direction = ? AND profile_id = ?').get(tarjetaId, dir, GOD_PROFILE_ID);
    if (!card) {
      db.prepare(`
        INSERT INTO vocabulary_review_cards (
          vocabulary_id, profile_id, direction, state,
          review_count, lapse_count, interval_days, ease_factor,
          next_review_at, created_at, updated_at
        ) VALUES (?, ?, ?, 'new', 0, 0, 0, ?, ?, ?, ?)
      `).run(tarjetaId, GOD_PROFILE_ID, dir, DEFAULT_EASE_FACTOR, now, now, now);
    }
  }

  // Link tarjeta to group
  db.prepare(`
    INSERT OR IGNORE INTO vocabulary_group_members (group_id, vocabulary_id, created_at)
    VALUES (?, ?, ?)
  `).run(ALMOST_LEARNED_GROUP_ID, tarjetaId, now);
  console.log(`[TARJETA] Linked ID ${tarjetaId} to Group ${ALMOST_LEARNED_GROUP_ID}\n`);

  // 3. Process all 100 Maya words
  const mayaWords = db.prepare('SELECT id, word, translation, example, example_translation, part_of_speech, gender FROM vocabulary WHERE profile_id = ? ORDER BY id').all(MAYA_PROFILE_ID);
  console.log(`Found ${mayaWords.length} Maya words to map and sync.`);

  const godWords = db.prepare('SELECT id, word, translation, example, example_translation FROM vocabulary WHERE profile_id = ?').all(GOD_PROFILE_ID);

  const linkedGodWordIds = new Set();

  for (let i = 0; i < mayaWords.length; i++) {
    const m = mayaWords[i];
    let godWordId = null;

    if (EXACT_OVERRIDE[m.word]) {
      godWordId = EXACT_OVERRIDE[m.word];
    } else {
      const ck = cleanKey(m.word);
      let candidates = godWords.filter(g => cleanKey(g.word) === ck);
      if (candidates.length === 0) {
        candidates = godWords.filter(g => cleanKey(g.word) === ck || ck.includes(cleanKey(g.word)) || cleanKey(g.word).includes(ck));
      }

      if (candidates.length === 1) {
        godWordId = candidates[0].id;
      } else if (candidates.length > 1) {
        let best = candidates[0];
        const mTransClean = cleanKey(m.translation);
        for (const cand of candidates) {
          const cTransClean = cleanKey(cand.translation);
          if (mTransClean.includes(cTransClean) || cTransClean.includes(mTransClean)) {
            best = cand;
            break;
          }
        }
        godWordId = best.id;
      }
    }

    if (!godWordId) {
      throw new Error(`Failed to resolve Maya word #${m.id}: "${m.word}" (${m.translation})`);
    }

    linkedGodWordIds.add(godWordId);

    // Unmark permanent learned so it is actively practiceable in "Почти выучил"
    db.prepare(`
      UPDATE vocabulary
      SET learned_permanently_at = NULL
      WHERE id = ? AND profile_id = ?
    `).run(godWordId, GOD_PROFILE_ID);

    // Ensure review cards exist
    for (const dir of ['source_to_target', 'target_to_source']) {
      const card = db.prepare('SELECT id FROM vocabulary_review_cards WHERE vocabulary_id = ? AND direction = ? AND profile_id = ?').get(godWordId, dir, GOD_PROFILE_ID);
      if (!card) {
        db.prepare(`
          INSERT INTO vocabulary_review_cards (
            vocabulary_id, profile_id, direction, state,
            review_count, lapse_count, interval_days, ease_factor,
            next_review_at, created_at, updated_at
          ) VALUES (?, ?, ?, 'new', 0, 0, 0, ?, ?, ?, ?)
        `).run(godWordId, GOD_PROFILE_ID, dir, DEFAULT_EASE_FACTOR, now, now, now);
      }
    }

    // Link into Group 6 (Почти выучил 1)
    db.prepare(`
      INSERT OR IGNORE INTO vocabulary_group_members (group_id, vocabulary_id, created_at)
      VALUES (?, ?, ?)
    `).run(ALMOST_LEARNED_GROUP_ID, godWordId, now);

    console.log(`  [${i + 1}/100] Synced Maya "${m.word}" -> God ID ${godWordId} into Group ${ALMOST_LEARNED_GROUP_ID}`);
  }

  // 4. Verification assertions
  console.log(`\n================== VERIFICATION ==================`);
  console.log(`Total unique God words resolved from Maya 100: ${linkedGodWordIds.size}`);
  if (linkedGodWordIds.size !== 100) {
    throw new Error(`Expected 100 unique God words mapped, but got ${linkedGodWordIds.size}`);
  }

  // Check how many of these 100 are in Group 6
  const inGroupCount = db.prepare(`
    SELECT COUNT(*) as total
    FROM vocabulary_group_members
    WHERE group_id = ? AND vocabulary_id IN (${Array.from(linkedGodWordIds).join(',')})
  `).get(ALMOST_LEARNED_GROUP_ID).total;

  console.log(`Maya words verified in Group ${ALMOST_LEARNED_GROUP_ID}: ${inGroupCount} / 100`);
  if (inGroupCount !== 100) {
    throw new Error(`Verification failed: only ${inGroupCount} of 100 Maya words are in Group ${ALMOST_LEARNED_GROUP_ID}`);
  }

  // Check tarjeta
  const tarjetaInGroup = db.prepare(`
    SELECT 1 FROM vocabulary_group_members WHERE group_id = ? AND vocabulary_id = ?
  `).get(ALMOST_LEARNED_GROUP_ID, tarjetaId);
  console.log(`Tarjeta verified in Group ${ALMOST_LEARNED_GROUP_ID}: ${Boolean(tarjetaInGroup)}`);
  if (!tarjetaInGroup) {
    throw new Error('Verification failed: tarjeta is not in Group 6');
  }

  // Total in Group 6
  const totalGroup6 = db.prepare('SELECT COUNT(*) as total FROM vocabulary_group_members WHERE group_id = ?').get(ALMOST_LEARNED_GROUP_ID).total;
  console.log(`Total words in Group ${ALMOST_LEARNED_GROUP_ID} ("${group.name}"): ${totalGroup6}`);
  console.log(`==================================================`);
});

run();
console.log('\nSUCCESS: All 100 Maya words and tarjeta are now guaranteed in God\'s "Почти выучил"!');
db.close();
