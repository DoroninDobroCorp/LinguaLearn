import Database from 'better-sqlite3';
import { buildVocabularyTextKey } from '/srv/LinguaLearn/spanish/server/unicodeKeys.js';

const DB_PATH = '/srv/LinguaLearn/spanish/server/spanish_learning.db';
const db = new Database(DB_PATH);

const GOD_PROFILE_ID = 6;
const ALMOST_LEARNED_GROUP_ID = 6;
const DEFAULT_EASE_FACTOR = 2.3;

const NEW_WORDS = [
  {
    word: 'el sol',
    translation: 'солнце',
    example: 'El sol brilla en el cielo despejado. (Солнце светит на ясном небе.)',
    part_of_speech: 'noun',
    gender: 'm',
  },
  {
    word: 'la luna',
    translation: 'луна',
    example: 'La luna llena ilumina la noche. (Полная луна освещает ночь.)',
    part_of_speech: 'noun',
    gender: 'f',
  },
  {
    word: 'los planetas',
    translation: 'планеты (планета)',
    example: 'La Tierra y Marte son planetas del sistema solar. (Земля и Марс — планеты солнечной системы.)',
    part_of_speech: 'noun',
    gender: 'm',
  },
  {
    word: 'las estrellas',
    translation: 'звезды (звезда)',
    example: 'Por la noche miramos las estrellas brillantes. (Ночью мы смотрим на яркие звёзды.)',
    part_of_speech: 'noun',
    gender: 'f',
  },
  {
    word: 'la hierba',
    translation: 'трава (газон)',
    example: 'La hierba verde crece después de la lluvia. (Зелёная трава растёт после дождя.)',
    part_of_speech: 'noun',
    gender: 'f',
  },
  {
    word: 'el cielo',
    translation: 'небо',
    example: 'El cielo es azul y no hay nubes. (Небо синее, и нет облаков.)',
    part_of_speech: 'noun',
    gender: 'm',
  },
  {
    word: 'el bien',
    translation: 'добро (благо)',
    example: 'Siempre debemos actuar haciendo el bien. (Всегда нужно поступать, творя добро.)',
    part_of_speech: 'noun',
    gender: 'm',
  },
  {
    word: 'el mal',
    translation: 'зло',
    example: 'La lucha constante entre el bien y el mal. (Постоянная борьба между добром и злом.)',
    part_of_speech: 'noun',
    gender: 'm',
  },
  {
    word: 'la memoria',
    translation: 'память',
    example: 'Practicar cada día mejora la memoria. (Ежедневная практика улучшает память.)',
    part_of_speech: 'noun',
    gender: 'f',
  },
  {
    word: 'la concentración',
    translation: 'концентрация',
    example: 'El estudio requiere mucha concentración y paciencia. (Учёба требует большой концентрации и терпения.)',
    part_of_speech: 'noun',
    gender: 'f',
  },
];

const now = new Date().toISOString();

const run = db.transaction(() => {
  const group = db.prepare('SELECT id, name FROM vocabulary_groups WHERE id = ? AND profile_id = ?').get(ALMOST_LEARNED_GROUP_ID, GOD_PROFILE_ID);
  if (!group) {
    throw new Error(`Group ${ALMOST_LEARNED_GROUP_ID} not found for profile ${GOD_PROFILE_ID}`);
  }
  console.log(`Target group: "${group.name}" (ID: ${group.id})`);

  let addedCount = 0;
  for (const item of NEW_WORDS) {
    const wordKey = buildVocabularyTextKey(item.word);
    const translationKey = buildVocabularyTextKey(item.translation);

    let vocab = db.prepare(`
      SELECT id, word, translation FROM vocabulary
      WHERE profile_id = ? AND word_key = ? AND translation_key = ?
    `).get(GOD_PROFILE_ID, wordKey, translationKey);

    let vocabId;
    if (vocab) {
      vocabId = vocab.id;
      db.prepare(`
        UPDATE vocabulary 
        SET example = ?, part_of_speech = ?, gender = ?, learned_permanently_at = NULL
        WHERE id = ?
      `).run(item.example, item.part_of_speech, item.gender, vocabId);
      console.log(`[EXISTING] ID ${vocabId}: "${item.word}" -> "${item.translation}"`);
    } else {
      const info = db.prepare(`
        INSERT INTO vocabulary (
          word, translation, example, level, next_review, review_count,
          created_at, profile_id, word_key, translation_key,
          is_favorite, learned_permanently_at, cefr_level,
          part_of_speech, gender
        ) VALUES (
          ?, ?, ?, 0, ?, 0,
          ?, ?, ?, ?,
          0, NULL, 'A1',
          ?, ?
        )
      `).run(
        item.word, item.translation, item.example, now,
        now, GOD_PROFILE_ID, wordKey, translationKey,
        item.part_of_speech, item.gender
      );
      vocabId = Number(info.lastInsertRowid);
      console.log(`[INSERTED] ID ${vocabId}: "${item.word}" -> "${item.translation}"`);
    }

    // Ensure review cards exist and are ready for practice
    for (const dir of ['source_to_target', 'target_to_source']) {
      const card = db.prepare(`
        SELECT id FROM vocabulary_review_cards
        WHERE vocabulary_id = ? AND direction = ?
      `).get(vocabId, dir);

      if (!card) {
        db.prepare(`
          INSERT INTO vocabulary_review_cards (
            vocabulary_id, profile_id, direction, state,
            review_count, lapse_count, interval_days, ease_factor,
            next_review_at, created_at, updated_at
          ) VALUES (?, ?, ?, 'new', 0, 0, 0, ?, ?, ?, ?)
        `).run(vocabId, GOD_PROFILE_ID, dir, DEFAULT_EASE_FACTOR, now, now, now);
      } else {
        // Reset next_review_at so it can be reviewed right now
        db.prepare(`
          UPDATE vocabulary_review_cards
          SET next_review_at = ?
          WHERE id = ?
        `).run(now, card.id);
      }
    }

    // Add to group 6
    const inGroup = db.prepare(`
      SELECT 1 FROM vocabulary_group_members
      WHERE group_id = ? AND vocabulary_id = ?
    `).get(ALMOST_LEARNED_GROUP_ID, vocabId);

    if (!inGroup) {
      db.prepare(`
        INSERT INTO vocabulary_group_members (group_id, vocabulary_id, created_at)
        VALUES (?, ?, ?)
      `).run(ALMOST_LEARNED_GROUP_ID, vocabId, now);
      addedCount++;
      console.log(`  + Linked to group 6: ID ${vocabId} (${item.word})`);
    } else {
      console.log(`  = Already in group 6: ID ${vocabId} (${item.word})`);
    }
  }

  const totalInGroup = db.prepare('SELECT COUNT(*) as c FROM vocabulary_group_members WHERE group_id = ?').get(ALMOST_LEARNED_GROUP_ID).c;
  console.log(`\nGroup 6 Total words now: ${totalInGroup}`);
});

run();
db.close();
