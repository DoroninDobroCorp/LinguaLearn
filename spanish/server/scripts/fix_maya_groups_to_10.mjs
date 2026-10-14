import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '/srv/LinguaLearn/spanish/server/spanish_learning.db';
const db = new Database(DB_PATH);

const MAYA_PROFILE_ID = 9;

const TEN_GROUPS = [
  {
    name: '🌟 1. Первые слова (Старт)',
    words: ['hola', 'chau', 'gracias', 'por favor', 'sí', 'no', 'el agua', 'el baño', 'la mamá', 'el papá']
  },
  {
    name: '🏠 2. Мой мир и друзья',
    words: ['la casa', 'la amiga', 'el amigo', 'el gato', 'el perro', 'jugar', 'comer', 'quiero', 'tengo', 'dale']
  },
  {
    name: '🎒 3. Школьный рюкзак',
    words: ['la mochila', 'el lápiz', 'el cuaderno', 'la goma', 'la tijera', 'el libro', 'dibujar', 'pintar', 'escuchar', 'mirar']
  },
  {
    name: '🎨 4. Школа и цвета',
    words: ['entender', 'la seño', 'el recreo', 'rojo', 'azul', 'amarillo', 'verde', 'blanco', 'negro', 'los colores']
  },
  {
    name: '🥐 5. Сладости и завтрак',
    words: ['el alfajor', 'la medialuna', 'el helado', 'la leche', 'el jugo', 'el pan', 'la manzana', 'la banana', 'las galletitas', 'el chocolate']
  },
  {
    name: '🏪 6. Киоск и перекус',
    words: ['el queso', 'la pizza', 'rico', 'el hambre', 'la sed', 'el quiosco', 'comprar', '¿cuánto cuesta?', 'la plata', 'la merienda']
  },
  {
    name: '🛝 7. Площадка и игры',
    words: ['la pelota', 'la plaza', 'la hamaca', 'el tobogán', 'correr', 'saltar', '¡gané!', 'el turno', 'rápido', 'despacio']
  },
  {
    name: '🧘‍♀️ 8. Тело и эмоции',
    words: ['la mano', 'la cabeza', 'los ojos', 'la boca', 'el pie', 'doler', 'cansada', 'feliz', 'lindo', 'copado']
  },
  {
    name: '👨‍👩‍👧 9. Семья и дом',
    words: ['el hermano', 'la hermana', 'el abuelo', 'la abuela', 'la cama', 'la mesa', 'la silla', 'la puerta', 'la ventana', 'el auto']
  },
  {
    name: '☀️ 10. Природа и погода',
    words: ['el sol', 'la lluvia', 'el día', 'la noche', 'grande', 'chiquito', 'esperar', 'ayudar', 'el calor', 'el frío']
  }
];

const OBSOLETE_GROUP_NAMES = [
  '⭐ 1. Самые важные (Старт)',
  '🎒 2. Школа и класс',
  '🍎 3. Еда и киоск',
  '🛝 4. Площадка и игры',
  '🏠 5. Семья и дом'
];

function runMigration() {
  const now = new Date().toISOString();
  console.log(`Starting Maya group restructuring (all groups to 10 words)...`);

  const mayaProfile = db.prepare('SELECT id, name FROM profiles WHERE id = ?').get(MAYA_PROFILE_ID);
  if (!mayaProfile) {
    throw new Error(`Profile ID ${MAYA_PROFILE_ID} not found!`);
  }
  console.log(`Target profile: "${mayaProfile.name}" (ID ${mayaProfile.id})`);

  // Map vocabulary words
  const mayaVocab = db.prepare('SELECT id, word FROM vocabulary WHERE profile_id = ?').all(MAYA_PROFILE_ID);
  const vocabByWord = new Map(mayaVocab.map(v => [v.word.trim().toLowerCase(), v.id]));
  console.log(`Loaded ${mayaVocab.length} words from Maya's vocabulary.`);

  const tx = db.transaction(() => {
    // 1. Check if legacy group 387 ("🛝 4. Площадка и игры") had recent practice timestamp to transfer to group 7 ("🛝 7. Площадка и игры")
    const legacyGroup4 = db.prepare('SELECT id, last_practiced_at FROM vocabulary_groups WHERE profile_id = ? AND name = ?').get(MAYA_PROFILE_ID, '🛝 4. Площадка и игры');
    const legacyPracticedAt = legacyGroup4?.last_practiced_at;

    // 2. Remove obsolete 20-word groups
    const obsoleteGroups = db.prepare(`
      SELECT id, name FROM vocabulary_groups
      WHERE profile_id = ? AND name IN (${OBSOLETE_GROUP_NAMES.map(() => '?').join(',')})
    `).all(MAYA_PROFILE_ID, ...OBSOLETE_GROUP_NAMES);

    const obsoleteGroupIds = obsoleteGroups.map(g => g.id);
    if (obsoleteGroupIds.length > 0) {
      console.log(`Removing ${obsoleteGroupIds.length} obsolete 20-word groups:`, obsoleteGroups.map(g => `"${g.name}" (#${g.id})`).join(', '));
      db.prepare(`DELETE FROM vocabulary_group_members WHERE group_id IN (${obsoleteGroupIds.join(',')})`).run();
      db.prepare(`DELETE FROM vocabulary_groups WHERE id IN (${obsoleteGroupIds.join(',')})`).run();

      // Clean up study sessions referencing obsolete groups
      const sessions = db.prepare('SELECT mode FROM vocabulary_study_sessions WHERE profile_id = ?').all(MAYA_PROFILE_ID);
      for (const s of sessions) {
        const touchesObsolete = obsoleteGroupIds.some(id => s.mode.includes(String(id)));
        if (touchesObsolete) {
          db.prepare('DELETE FROM vocabulary_study_sessions WHERE profile_id = ? AND mode = ?').run(MAYA_PROFILE_ID, s.mode);
          console.log(`  - Cleaned up obsolete study session: mode "${s.mode}"`);
        }
      }
    }

    // 3. Ensure the 10 groups exist and each has all 10 words
    for (let i = 0; i < TEN_GROUPS.length; i++) {
      const gDef = TEN_GROUPS[i];
      let group = db.prepare('SELECT id, name, last_practiced_at FROM vocabulary_groups WHERE profile_id = ? AND name = ?').get(MAYA_PROFILE_ID, gDef.name);

      if (!group) {
        const res = db.prepare('INSERT INTO vocabulary_groups (profile_id, name, created_at) VALUES (?, ?, ?)').run(MAYA_PROFILE_ID, gDef.name, now);
        group = { id: Number(res.lastInsertRowid), name: gDef.name, last_practiced_at: null };
        console.log(`  + Created 10-word group: "${group.name}" (ID ${group.id})`);
      } else {
        console.log(`  = Group already exists: "${group.name}" (ID ${group.id})`);
      }

      // If this is Group 7 ("🛝 7. Площадка и игры") and legacy Group 4 had a recent practice timestamp, preserve it
      if (gDef.name.includes('Площадка и игры') && legacyPracticedAt && !group.last_practiced_at) {
        db.prepare('UPDATE vocabulary_groups SET last_practiced_at = ? WHERE id = ?').run(legacyPracticedAt, group.id);
        console.log(`    ↳ Transferred recent practice timestamp (${legacyPracticedAt}) to Group ${group.id}`);
      }

      // Clear existing members for this group and re-insert exact 10 words
      db.prepare('DELETE FROM vocabulary_group_members WHERE group_id = ?').run(group.id);

      const insertMember = db.prepare('INSERT INTO vocabulary_group_members (group_id, vocabulary_id, created_at) VALUES (?, ?, ?)');
      for (const w of gDef.words) {
        const vocabId = vocabByWord.get(w.toLowerCase());
        if (!vocabId) {
          throw new Error(`Word "${w}" not found in Maya vocabulary!`);
        }
        insertMember.run(group.id, vocabId, now);
      }
      console.log(`    ↳ Added all ${gDef.words.length} words to "${gDef.name}"`);
    }
  });

  tx();

  // Verification
  console.log(`\n================== VERIFICATION ==================`);
  const currentGroups = db.prepare(`
    SELECT g.id, g.name, COUNT(gm.vocabulary_id) as word_count, g.last_practiced_at
    FROM vocabulary_groups g
    LEFT JOIN vocabulary_group_members gm ON gm.group_id = g.id
    WHERE g.profile_id = ?
    GROUP BY g.id
    ORDER BY g.id ASC
  `).all(MAYA_PROFILE_ID);

  console.log(`Total groups for Maya: ${currentGroups.length}`);
  if (currentGroups.length !== 10) {
    throw new Error(`Expected exactly 10 groups, got ${currentGroups.length}`);
  }

  let totalMembers = 0;
  for (const g of currentGroups) {
    console.log(`- [#${g.id}] "${g.name}": ${g.word_count} words (last practiced: ${g.last_practiced_at || 'never'})`);
    if (g.word_count !== 10) {
      throw new Error(`Group "${g.name}" has ${g.word_count} words instead of 10!`);
    }
    totalMembers += g.word_count;
  }

  console.log(`Total words across all groups: ${totalMembers}`);
  if (totalMembers !== 100) {
    throw new Error(`Expected exactly 100 total group members, got ${totalMembers}`);
  }

  // Ensure no word is assigned to more than 1 group
  const duplicateAssignments = db.prepare(`
    SELECT gm.vocabulary_id, v.word, COUNT(gm.group_id) as c
    FROM vocabulary_group_members gm
    JOIN vocabulary_groups g ON g.id = gm.group_id
    JOIN vocabulary v ON v.id = gm.vocabulary_id
    WHERE g.profile_id = ?
    GROUP BY gm.vocabulary_id
    HAVING c > 1
  `).all(MAYA_PROFILE_ID);

  if (duplicateAssignments.length > 0) {
    throw new Error(`Found words assigned to multiple groups: ${JSON.stringify(duplicateAssignments)}`);
  }
  console.log(`All 100 words assigned uniquely (1 group per word).`);
  console.log(`==================================================`);
  console.log(`SUCCESS: Maya profile now has all 10 groups of 10 words each!`);
}

runMigration();
db.close();
