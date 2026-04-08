import { buildVocabularyTextKey } from './unicodeKeys.js';

const DESIRED_UNIQUE_INDEX_NAME = 'idx_vocabulary_word_profile';
const LOOKUP_INDEX_NAME = 'idx_vocabulary_profile_word_translation_lookup';
const KEY_COLUMNS = [
  { name: 'word_key', sql: 'ALTER TABLE vocabulary ADD COLUMN word_key TEXT' },
  { name: 'translation_key', sql: 'ALTER TABLE vocabulary ADD COLUMN translation_key TEXT' },
];

function getIndexSql(db, indexName) {
  return db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?"
  ).get(indexName)?.sql ?? null;
}

function hasDesiredVocabularyUniqueIndex(sql) {
  if (!sql) {
    return false;
  }

  return /unique\s+index/i.test(sql)
    && /word_key/i.test(sql)
    && /translation_key/i.test(sql)
    && /profile_id/i.test(sql);
}

function hasDesiredVocabularyLookupIndex(sql) {
  if (!sql) {
    return false;
  }

  return /create\s+index/i.test(sql)
    && /profile_id/i.test(sql)
    && /word_key/i.test(sql)
    && /translation_key/i.test(sql);
}

function ensureVocabularyKeyColumns(db) {
  for (const column of KEY_COLUMNS) {
    try {
      db.prepare(`SELECT ${column.name} FROM vocabulary LIMIT 1`).get();
    } catch {
      db.exec(column.sql);
    }
  }
}

function syncVocabularyKeys(db) {
  const rows = db.prepare('SELECT id, word, translation, word_key, translation_key FROM vocabulary ORDER BY id ASC').all();
  const updateKeys = db.prepare('UPDATE vocabulary SET word_key = ?, translation_key = ? WHERE id = ?');

  for (const row of rows) {
    const nextWordKey = buildVocabularyTextKey(row.word);
    const nextTranslationKey = buildVocabularyTextKey(row.translation ?? '');
    if (row.word_key !== nextWordKey || row.translation_key !== nextTranslationKey) {
      updateKeys.run(nextWordKey, nextTranslationKey, row.id);
    }
  }
}

function findExactVocabularyDuplicates(db) {
  return db.prepare(`
    SELECT
      profile_id,
      MIN(word) AS word,
      MIN(translation) AS translation,
      COUNT(*) AS duplicate_count
    FROM vocabulary
    GROUP BY profile_id, word_key, translation_key
    HAVING COUNT(*) > 1
    ORDER BY profile_id ASC, word_key ASC, translation_key ASC
  `).all();
}

export function ensureVocabularyExactDuplicateIndex(db) {
  ensureVocabularyKeyColumns(db);

  const migrate = db.transaction(() => {
    syncVocabularyKeys(db);

    const currentLookupSql = getIndexSql(db, LOOKUP_INDEX_NAME);
    if (!hasDesiredVocabularyLookupIndex(currentLookupSql)) {
      if (currentLookupSql) {
        db.exec(`DROP INDEX ${LOOKUP_INDEX_NAME}`);
      }
      db.exec(`
        CREATE INDEX IF NOT EXISTS ${LOOKUP_INDEX_NAME}
        ON vocabulary(profile_id, word_key, translation_key)
      `);
    }

    const exactDuplicates = findExactVocabularyDuplicates(db);
    const currentUniqueSql = getIndexSql(db, DESIRED_UNIQUE_INDEX_NAME);

    if (currentUniqueSql && !hasDesiredVocabularyUniqueIndex(currentUniqueSql)) {
      db.exec(`DROP INDEX ${DESIRED_UNIQUE_INDEX_NAME}`);
    }

    const createdUniqueIndex = exactDuplicates.length === 0 && !hasDesiredVocabularyUniqueIndex(getIndexSql(db, DESIRED_UNIQUE_INDEX_NAME));
    if (createdUniqueIndex) {
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS ${DESIRED_UNIQUE_INDEX_NAME}
        ON vocabulary(word_key, translation_key, profile_id)
      `);
    }

    return {
      createdUniqueIndex,
      uniqueIndexPresent: exactDuplicates.length === 0,
      exactDuplicates,
    };
  });

  return migrate();
}
