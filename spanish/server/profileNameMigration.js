import { buildProfileNameKey } from './unicodeKeys.js';

const DEFAULT_PROFILE_NAME_MAX_LENGTH = 30;
const PROFILE_RENAME_FALLBACK = 'Profile';
const PROFILE_NAME_KEY_COLUMN = {
  name: 'name_key',
  sql: 'ALTER TABLE profiles ADD COLUMN name_key TEXT',
};

function getIndexSql(db, indexName) {
  return db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?"
  ).get(indexName)?.sql ?? null;
}

function hasDesiredProfileIndex(sql) {
  return Boolean(sql)
    && /unique\s+index/i.test(sql)
    && /\(\s*name_key\s*\)/i.test(sql);
}

function ensureProfileNameKeyColumn(db) {
  try {
    db.prepare(`SELECT ${PROFILE_NAME_KEY_COLUMN.name} FROM profiles LIMIT 1`).get();
  } catch {
    db.exec(PROFILE_NAME_KEY_COLUMN.sql);
  }
}

function syncProfileNameKeys(db) {
  const rows = db.prepare('SELECT id, name, name_key FROM profiles ORDER BY id ASC').all();
  const updateProfileKey = db.prepare('UPDATE profiles SET name_key = ? WHERE id = ?');

  for (const row of rows) {
    const nextKey = buildProfileNameKey(row.name);
    if (row.name_key !== nextKey) {
      updateProfileKey.run(nextKey, row.id);
    }
  }
}

function buildRenamedProfileCandidate(name, profileId, attempt, maxLength) {
  const suffix = attempt === 0 ? ` (${profileId})` : ` (${profileId}-${attempt + 1})`;
  const normalizedMaxLength = Math.max(suffix.length + 1, maxLength);
  const availableBaseLength = Math.max(1, normalizedMaxLength - suffix.length);
  const baseName = typeof name === 'string' && name.trim().length > 0
    ? name.trim()
    : PROFILE_RENAME_FALLBACK;
  const trimmedBase = baseName.slice(0, availableBaseLength).trimEnd() || PROFILE_RENAME_FALLBACK.slice(0, availableBaseLength);
  return `${trimmedBase}${suffix}`;
}

function findAvailableRenamedProfileName(db, profileId, name, maxLength) {
  let attempt = 0;
  while (attempt < 10_000) {
    const candidate = buildRenamedProfileCandidate(name, profileId, attempt, maxLength);
    const conflict = db.prepare(
      'SELECT 1 FROM profiles WHERE id != ? AND name_key = ?'
    ).get(profileId, buildProfileNameKey(candidate));

    if (!conflict) {
      return candidate;
    }

    attempt += 1;
  }

  throw new Error(`Unable to generate a unique migrated profile name for profile ${profileId}`);
}

function renameCaseOnlyDuplicateProfiles(db, maxLength) {
  const duplicateGroups = db.prepare(`
    SELECT name_key
    FROM profiles
    GROUP BY name_key
    HAVING COUNT(*) > 1
    ORDER BY name_key ASC
  `).all();

  if (duplicateGroups.length === 0) {
    return [];
  }

  const renameProfile = db.prepare('UPDATE profiles SET name = ?, name_key = ? WHERE id = ?');
  const renamedProfiles = [];

  for (const group of duplicateGroups) {
    const profiles = db.prepare(`
      SELECT id, name
      FROM profiles
      WHERE name_key = ?
      ORDER BY id ASC
    `).all(group.name_key);

    for (const profile of profiles.slice(1)) {
      const nextName = findAvailableRenamedProfileName(db, profile.id, profile.name, maxLength);
      renameProfile.run(nextName, buildProfileNameKey(nextName), profile.id);
      renamedProfiles.push({
        id: profile.id,
        previousName: profile.name,
        nextName,
      });
    }
  }

  return renamedProfiles;
}

export function ensureCaseInsensitiveProfileNameIndex(
  db,
  {
    indexName = 'idx_profiles_name',
    maxLength = DEFAULT_PROFILE_NAME_MAX_LENGTH,
  } = {},
) {
  ensureProfileNameKeyColumn(db);

  const migrate = db.transaction(() => {
    syncProfileNameKeys(db);
    const renamedProfiles = renameCaseOnlyDuplicateProfiles(db, maxLength);
    const existingIndexSql = getIndexSql(db, indexName);

    if (existingIndexSql && !hasDesiredProfileIndex(existingIndexSql)) {
      db.exec(`DROP INDEX ${indexName}`);
    }

    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${indexName} ON profiles(name_key)`);
    return renamedProfiles;
  });

  const renamedProfiles = migrate();
  const existingIndexSql = getIndexSql(db, indexName);

  return {
    renamedProfiles,
    uniqueIndexPresent: hasDesiredProfileIndex(existingIndexSql),
  };
}
