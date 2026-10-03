import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVocabularyTextKey } from '../unicodeKeys.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../spanish_learning.db');

console.log(`Using DB: ${DB_PATH}`);
const db = new Database(DB_PATH);

const TARGET_PROFILE_IDS = [6, 8, 1]; // 6 = God (primary), 8 = Vovka, 1 = Default
const GROUP_NAME = 'Числа (10–1000)';

const NUMBERS_SPEC = [
  { num: 10, word: 'diez', translation: 'десять (10)', example: 'Cuesta diez euros.', example_translation: 'Это стоит десять евро.' },
  { num: 20, word: 'veinte', translation: 'двадцать (20)', example: 'Tengo veinte euros.', example_translation: 'У меня двадцать евро.' },
  { num: 30, word: 'treinta', translation: 'тридцать (30)', example: 'El autobús llega en treinta minutos.', example_translation: 'Автобус приедет через тридцать минут.' },
  { num: 40, word: 'cuarenta', translation: 'сорок (40)', example: 'El viaje dura cuarenta minutos.', example_translation: 'Поездка длится сорок минут.' },
  { num: 50, word: 'cincuenta', translation: 'пятьдесят (50)', example: 'Son cincuenta dólares.', example_translation: 'Это пятьдесят долларов.' },
  { num: 60, word: 'sesenta', translation: 'шестьдесят (60)', example: 'Un minuto tiene sesenta segundos.', example_translation: 'В минуте шестьдесят секунд.' },
  { num: 70, word: 'setenta', translation: 'семьдесят (70)', example: 'El libro tiene setenta páginas.', example_translation: 'В книге семьдесят страниц.' },
  { num: 80, word: 'ochenta', translation: 'восемьдесят (80)', example: 'El abuelo tiene ochenta años.', example_translation: 'Дедушке восемьдесят лет.' },
  { num: 90, word: 'noventa', translation: 'девяносто (90)', example: 'Cuesta noventa pesos.', example_translation: 'Стоит девяносто песо.' },
  { num: 100, word: 'cien', translation: 'сто (100)', example: 'Tengo cien pesos.', example_translation: 'У меня сто песо.', aliases: ['cien', 'cien / ciento'] },
  { num: 200, word: 'doscientos', translation: 'двести (200)', example: 'Cuesta doscientos pesos.', example_translation: 'Это стоит двести песо.' },
  { num: 300, word: 'trescientos', translation: 'триста (300)', example: 'El edificio tiene trescientos metros.', example_translation: 'Здание высотой триста метров.' },
  { num: 400, word: 'cuatrocientos', translation: 'четыреста (400)', example: 'Viajamos cuatrocientos kilómetros.', example_translation: 'Мы проехали четыреста километров.' },
  { num: 500, word: 'quinientos', translation: 'пятьсот (500)', example: 'La habitación cuesta quinientos pesos.', example_translation: 'Номер стоит пятьсот песо.' },
  { num: 600, word: 'seiscientos', translation: 'шестьсот (600)', example: 'El curso cuesta seiscientos dólares.', example_translation: 'Курс стоит шестьсот долларов.' },
  { num: 700, word: 'setecientos', translation: 'семьсот (700)', example: 'En la escuela hay setecientos estudiantes.', example_translation: 'В школе семьсот учеников.' },
  { num: 800, word: 'ochocientos', translation: 'восемьсот (800)', example: 'La biblioteca tiene ochocientos libros.', example_translation: 'В библиотеке восемьсот книг.' },
  { num: 900, word: 'novecientos', translation: 'девятьсот (900)', example: 'El pueblo tiene novecientos habitantes.', example_translation: 'В посёлке девятьсот жителей.' },
  { num: 1000, word: 'mil', translation: 'тысяча (1000)', example: '¡Mil gracias por tu ayuda!', example_translation: 'Огромное спасибо (тысяча благодарностей) за помощь!' },
];

const run = db.transaction(() => {
  for (const profileId of TARGET_PROFILE_IDS) {
    const profile = db.prepare('SELECT id, name FROM profiles WHERE id = ?').get(profileId);
    if (!profile) {
      console.log(`[SKIP] Profile ${profileId} does not exist`);
      continue;
    }
    console.log(`\n========================================`);
    console.log(`Processing Profile: ${profile.name} (ID: ${profile.id})`);
    console.log(`========================================`);

    const wordIdsInGroup = [];

    for (const spec of NUMBERS_SPEC) {
      const aliases = spec.aliases || [spec.word];
      const wordKey = buildVocabularyTextKey(spec.word);
      const transKey = buildVocabularyTextKey(spec.translation);

      // Find matching row in vocabulary for this profile
      let existingRow = db.prepare(`
        SELECT id, word, translation, review_count
        FROM vocabulary
        WHERE profile_id = ? AND (word_key = ? OR word IN (${aliases.map(() => '?').join(',')}))
        ORDER BY review_count DESC, id ASC
        LIMIT 1
      `).get(profileId, wordKey, ...aliases);

      let wordId;
      if (existingRow) {
        wordId = existingRow.id;
        // Update to clean standard form
        db.prepare(`
          UPDATE vocabulary
          SET word = ?, word_key = ?, translation = ?, translation_key = ?,
              example = ?, example_translation = ?, part_of_speech = 'number'
          WHERE id = ? AND profile_id = ?
        `).run(spec.word, wordKey, spec.translation, transKey, spec.example, spec.example_translation, wordId, profileId);
        console.log(`  [UPDATE #${spec.num}] ID ${wordId}: ${spec.word} -> ${spec.translation}`);
      } else {
        // Insert new entry
        const res = db.prepare(`
          INSERT INTO vocabulary (
            profile_id, word, word_key, translation, translation_key,
            example, example_translation, part_of_speech, level
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'number', 1)
        `).run(profileId, spec.word, wordKey, spec.translation, transKey, spec.example, spec.example_translation);
        wordId = res.lastInsertRowid;
        console.log(`  [INSERT #${spec.num}] ID ${wordId}: ${spec.word} -> ${spec.translation}`);
      }

      wordIdsInGroup.push(wordId);
    }

    // Ensure the group exists
    let group = db.prepare('SELECT id, name FROM vocabulary_groups WHERE profile_id = ? AND name = ?').get(profileId, GROUP_NAME);
    if (!group) {
      const gRes = db.prepare('INSERT INTO vocabulary_groups (profile_id, name) VALUES (?, ?)').run(profileId, GROUP_NAME);
      group = { id: gRes.lastInsertRowid, name: GROUP_NAME };
      console.log(`[CREATED GROUP] ID: ${group.id}, Name: "${group.name}" for profile ${profile.name}`);
    } else {
      console.log(`[EXISTING GROUP] ID: ${group.id}, Name: "${group.name}" for profile ${profile.name}`);
    }

    // Set group members: remove any existing, and add strictly the 19 words
    db.prepare('DELETE FROM vocabulary_group_members WHERE group_id = ?').run(group.id);
    const insertMember = db.prepare('INSERT OR IGNORE INTO vocabulary_group_members (group_id, vocabulary_id) VALUES (?, ?)');

    for (const wId of wordIdsInGroup) {
      insertMember.run(group.id, wId);
    }

    // Verify member count
    const countRow = db.prepare('SELECT COUNT(*) AS total FROM vocabulary_group_members WHERE group_id = ?').get(group.id);
    console.log(`[VERIFIED] Group "${group.name}" (ID ${group.id}) now has exactly ${countRow.total} words!`);
    if (countRow.total !== 19) {
      throw new Error(`Expected exactly 19 words in group, but got ${countRow.total}`);
    }
  }
});

run();
console.log('\nAll done! Target numbers group successfully created and verified.');
