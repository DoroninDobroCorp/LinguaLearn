import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { buildVocabularyTextKey } from '../unicodeKeys.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || '/srv/LinguaLearn/spanish/server/spanish_learning.db';
const db = new Database(DB_PATH);

const MAYA_PROFILE_ID = 9;
const DEFAULT_EASE_FACTOR = 2.3;

function run() {
  const now = new Date().toISOString();
  console.log(`Starting insertion of 256 new curated words for Maya (Profile ID ${MAYA_PROFILE_ID})...`);

  const jsonPath = path.join(__dirname, 'maya_256_new_words.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`JSON file not found: ${jsonPath}`);
  }

  const newWords = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Loaded ${newWords.length} words from JSON.`);

  // Verify profile exists
  const profile = db.prepare('SELECT id, name FROM profiles WHERE id = ?').get(MAYA_PROFILE_ID);
  if (!profile) {
    throw new Error(`Profile ${MAYA_PROFILE_ID} not found!`);
  }
  console.log(`Target profile: "${profile.name}" (ID ${profile.id})`);

  let insertedWords = 0;
  let skippedWords = 0;
  let insertedCards = 0;
  let linkedGroupMembers = 0;
  let createdGroups = 0;

  const transaction = db.transaction(() => {
    for (const item of newWords) {
      const wordKey = buildVocabularyTextKey(item.word);
      const translationKey = buildVocabularyTextKey(item.translation);

      // Check if word already exists in vocabulary for Maya
      const existing = db.prepare(
        'SELECT id FROM vocabulary WHERE profile_id = ? AND word_key = ?'
      ).get(MAYA_PROFILE_ID, wordKey);

      let vocabId;

      if (existing) {
        vocabId = existing.id;
        skippedWords++;
      } else {
        const raw = item.word.toLowerCase().replace(/^(el|la|los|las|un|una)\s+/, '').replace(/[¿¡?!]/g, '').trim();
        const slugAscii = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/_+$/, '');
        const autoImageUrl = item.image_url || `/spanish/images/vocab/${slugAscii}.jpg`;

        const insertResult = db.prepare(`
          INSERT INTO vocabulary (
            word, translation, example, level, next_review, review_count,
            created_at, profile_id, word_key, translation_key,
            is_favorite, cefr_level, part_of_speech, gender,
            example_translation, image_url
          ) VALUES (
            ?, ?, ?, 0, ?, 0,
            ?, ?, ?, ?,
            0, 'A1', ?, ?,
            ?, ?
          )
        `).run(
          item.word,
          item.translation,
          item.example,
          now,
          now,
          MAYA_PROFILE_ID,
          wordKey,
          translationKey,
          item.pos || null,
          item.gender || null,
          item.example_translation || null,
          autoImageUrl
        );

        vocabId = Number(insertResult.lastInsertRowid);
        insertedWords++;
      }

      // Ensure review cards
      for (const dir of ['source_to_target', 'target_to_source']) {
        const card = db.prepare(
          'SELECT id FROM vocabulary_review_cards WHERE vocabulary_id = ? AND direction = ?'
        ).get(vocabId, dir);

        if (!card) {
          db.prepare(`
            INSERT INTO vocabulary_review_cards (
              vocabulary_id, profile_id, direction, state,
              review_count, lapse_count, interval_days, ease_factor,
              next_review_at, created_at, updated_at
            ) VALUES (?, ?, ?, 'new', 0, 0, 0, ?, ?, ?, ?)
          `).run(vocabId, MAYA_PROFILE_ID, dir, DEFAULT_EASE_FACTOR, now, now, now);
          insertedCards++;
        }
      }

      // Group association
      if (item.group) {
        let group = db.prepare(
          'SELECT id FROM vocabulary_groups WHERE profile_id = ? AND name = ?'
        ).get(MAYA_PROFILE_ID, item.group);

        if (!group) {
          const gRes = db.prepare(
            'INSERT INTO vocabulary_groups (profile_id, name, created_at) VALUES (?, ?, ?)'
          ).run(MAYA_PROFILE_ID, item.group, now);
          group = { id: Number(gRes.lastInsertRowid) };
          createdGroups++;
        }

        const isMember = db.prepare(
          'SELECT 1 FROM vocabulary_group_members WHERE group_id = ? AND vocabulary_id = ?'
        ).get(group.id, vocabId);

        if (!isMember) {
          db.prepare(
            'INSERT INTO vocabulary_group_members (group_id, vocabulary_id, created_at) VALUES (?, ?, ?)'
          ).run(group.id, vocabId, now);
          linkedGroupMembers++;
        }
      }
    }
  });

  transaction();

  console.log(`\nImport complete:`);
  console.log(`- Inserted new words into vocabulary: ${insertedWords}`);
  console.log(`- Skipped existing words: ${skippedWords}`);
  console.log(`- Created review cards: ${insertedCards}`);
  console.log(`- Created new groups: ${createdGroups}`);
  console.log(`- Linked group members: ${linkedGroupMembers}`);
  
  const totalMayaWords = db.prepare('SELECT count(*) as c FROM vocabulary WHERE profile_id = ?').get(MAYA_PROFILE_ID).c;
  const totalMayaCards = db.prepare('SELECT count(*) as c FROM vocabulary_review_cards WHERE profile_id = ?').get(MAYA_PROFILE_ID).c;
  const totalMayaGroups = db.prepare('SELECT count(*) as c FROM vocabulary_groups WHERE profile_id = ?').get(MAYA_PROFILE_ID).c;

  console.log(`\nMaya summary in database:`);
  console.log(`- Total vocabulary words: ${totalMayaWords}`);
  console.log(`- Total review cards: ${totalMayaCards}`);
  console.log(`- Total groups: ${totalMayaGroups}`);
}

run();
