import Database from 'better-sqlite3';
import { buildVocabularyTextKey } from '../unicodeKeys.js';

const DB_PATH = process.env.DB_PATH || '/srv/LinguaLearn/spanish/server/spanish_learning.db';
const db = new Database(DB_PATH);

const GOD_PROFILE_ID = 6;
const ALMOST_LEARNED_GROUP_ID = 6;
const DEFAULT_EASE_FACTOR = 2.3;

const DEMONSTRATIVES = [
  {
    word: 'aquí',
    aliases: ['aqui', 'aquí'],
    translation: 'здесь / тут (рядом с говорящим)',
    example: 'Mi casa está aquí (Мой дом здесь). / Siéntate aquí a mi lado.',
  },
  {
    word: 'acá',
    aliases: ['aca', 'acá'],
    translation: 'сюда / здесь (направление к говорящему / в этой зоне)',
    example: 'Ven acá, por favor (Иди сюда, пожалуйста). / Acá en mi país hace calor.',
  },
  {
    word: 'este',
    aliases: ['este'],
    translation: 'этот (муж. род, близко к говорящему) / восток',
    example: 'Este libro es muy interesante (Эта книга очень интересная). / El sol sale por el este.',
  },
  {
    word: 'ahí',
    aliases: ['ahi', 'ahí'],
    translation: 'там / тут (рядом с собеседником / средняя дистанция)',
    example: 'Deja las llaves ahí sobre la mesa (Оставь ключи там / тут на столе). / ¿Quién está ahí?',
  },
  {
    word: 'ese',
    aliases: ['ese'],
    translation: 'тот / этот (муж. род, рядом с собеседником / средняя дистанция)',
    example: 'Pásame ese libro, por favor (Передай мне ту книгу, пожалуйста). / Ese chico es mi amigo.',
  },
  {
    word: 'allí',
    aliases: ['alli', 'allí'],
    translation: 'там / туда (далеко от обоих, конкретное место)',
    example: 'El museo está allí, al fondo de la calle (Музей находится там, в конце улицы). / Nos vemos allí a las ocho.',
  },
  {
    word: 'allá',
    aliases: ['alla', 'allá'],
    translation: 'вон там / туда (далеко от обоих, менее определенная зона / направление)',
    example: 'Miró hacia allá y vio el mar (Он посмотрел вон туда и увидел море). / Más allá de las montañas.',
  },
  {
    word: 'aquel',
    aliases: ['aquel'],
    translation: 'тот / вон тот (муж. род, далекий в пространстве или времени)',
    example: 'Aquel coche rojo es de mi padre (Вон та красная машина — моего отца). / En aquel tiempo todo era diferente.',
  },
];

const now = new Date().toISOString();

const run = db.transaction(() => {
  const profile = db.prepare('SELECT id, name FROM profiles WHERE id = ?').get(GOD_PROFILE_ID);
  if (!profile) throw new Error(`Profile ${GOD_PROFILE_ID} not found`);

  const group = db.prepare('SELECT id, name FROM vocabulary_groups WHERE id = ? AND profile_id = ?').get(ALMOST_LEARNED_GROUP_ID, GOD_PROFILE_ID);
  if (!group) throw new Error(`Group ${ALMOST_LEARNED_GROUP_ID} not found`);

  console.log(`Target: Profile ${profile.name} (ID: ${profile.id}), Group: ${group.name} (ID: ${group.id})`);

  for (const item of DEMONSTRATIVES) {
    const wordKey = buildVocabularyTextKey(item.word);
    const translationKey = buildVocabularyTextKey(item.translation);

    // Find all existing matching entries for God (including aliases)
    const matchingRows = db.prepare(`
      SELECT id, word, translation, example, review_count
      FROM vocabulary
      WHERE profile_id = ? AND (word_key = ? OR word IN (${item.aliases.map(() => '?').join(',')}))
      ORDER BY review_count DESC, id ASC
    `).all(GOD_PROFILE_ID, wordKey, ...item.aliases);

    let primaryId;

    if (matchingRows.length > 0) {
      primaryId = matchingRows[0].id;
      console.log(`[FOUND] Primary ID ${primaryId} for "${item.word}" (matches: ${matchingRows.map(r => r.id).join(', ')})`);

      // Update primary row
      db.prepare(`
        UPDATE vocabulary
        SET word = ?, word_key = ?, translation = ?, translation_key = ?, example = ?
        WHERE id = ? AND profile_id = ?
      `).run(item.word, wordKey, item.translation, translationKey, item.example, primaryId, GOD_PROFILE_ID);

      // If there are duplicate rows, merge group memberships into primary and delete duplicate rows
      for (let i = 1; i < matchingRows.length; i++) {
        const dupId = matchingRows[i].id;
        console.log(`  -> Merging duplicate ID ${dupId} into primary ID ${primaryId}...`);

        const dupGroups = db.prepare('SELECT group_id FROM vocabulary_group_members WHERE vocabulary_id = ?').all(dupId);
        for (const g of dupGroups) {
          db.prepare('INSERT OR IGNORE INTO vocabulary_group_members (group_id, vocabulary_id, created_at) VALUES (?, ?, ?)').run(g.group_id, primaryId, now);
        }

        // Delete duplicate entry (cascade deletes cards and group memberships)
        db.prepare('DELETE FROM vocabulary WHERE id = ? AND profile_id = ?').run(dupId, GOD_PROFILE_ID);
        console.log(`  -> Deleted duplicate ID ${dupId}`);
      }
    } else {
      const result = db.prepare(`
        INSERT INTO vocabulary (
          word, word_key, translation, translation_key, example,
          level, next_review, review_count, last_reviewed, created_at,
          profile_id, is_favorite
        ) VALUES (?, ?, ?, ?, ?, 0, ?, 0, NULL, ?, ?, 0)
      `).run(item.word, wordKey, item.translation, translationKey, item.example, now, now, GOD_PROFILE_ID);

      primaryId = result.lastInsertRowid;
      console.log(`[INSERT] ID ${primaryId}: "${item.word}" -> "${item.translation}"`);
    }

    // Ensure review cards exist
    const directions = ['source_to_target', 'target_to_source'];
    for (const dir of directions) {
      const card = db.prepare('SELECT id FROM vocabulary_review_cards WHERE vocabulary_id = ? AND direction = ?').get(primaryId, dir);
      if (!card) {
        db.prepare(`
          INSERT INTO vocabulary_review_cards (
            vocabulary_id, profile_id, direction, state,
            review_count, lapse_count, interval_days, ease_factor,
            next_review_at, learned_until, last_reviewed_at, created_at, updated_at
          ) VALUES (?, ?, ?, 'new', 0, 0, 0, ?, ?, NULL, NULL, ?, ?)
        `).run(primaryId, GOD_PROFILE_ID, dir, DEFAULT_EASE_FACTOR, now, now, now);
      }
    }

    // Ensure added to group 6
    const inGroup = db.prepare('SELECT 1 FROM vocabulary_group_members WHERE group_id = ? AND vocabulary_id = ?').get(ALMOST_LEARNED_GROUP_ID, primaryId);
    if (!inGroup) {
      db.prepare('INSERT INTO vocabulary_group_members (group_id, vocabulary_id, created_at) VALUES (?, ?, ?)').run(ALMOST_LEARNED_GROUP_ID, primaryId, now);
      console.log(`  + Linked ID ${primaryId} ("${item.word}") to group '${group.name}'`);
    } else {
      console.log(`  = ID ${primaryId} ("${item.word}") already in group '${group.name}'`);
    }
  }

  console.log('\n--- SUCCESS: All 8 demonstrative words/adverbs processed for God ---');
});

run();
db.close();
