import Database from 'better-sqlite3';
import { buildVocabularyTextKey, buildProfileNameKey } from '../unicodeKeys.js';

const DB_PATH = '/srv/LinguaLearn/spanish/server/spanish_learning.db';
const db = new Database(DB_PATH);

const GROUPS_DATA = [
  {
    name: '⭐ 1. Самые важные (Старт)',
    isActiveNow: true,
    words: [
      { word: 'hola', translation: 'привет / здравствуй', example: '¡Hola! ¿Cómo estás?', pos: 'interjection', gender: null },
      { word: 'chau', translation: 'пока / до свидания', example: 'Chau, ¡hasta mañana!', pos: 'interjection', gender: null },
      { word: 'gracias', translation: 'спасибо', example: 'Muchas gracias por la ayuda', pos: 'noun', gender: 'f' },
      { word: 'por favor', translation: 'пожалуйста', example: 'Un vaso de agua, por favor', pos: 'phrase', gender: null },
      { word: 'sí', translation: 'да', example: 'Sí, me encanta jugar', pos: 'adverb', gender: null },
      { word: 'no', translation: 'нет', example: 'No, gracias', pos: 'adverb', gender: null },
      { word: 'el agua', translation: 'вода', example: 'Tomá un poco de agua fresca', pos: 'noun', gender: 'f' },
      { word: 'el baño', translation: 'туалет', example: '¿Puedo ir al baño, seño?', pos: 'noun', gender: 'm' },
      { word: 'la mamá', translation: 'мама', example: 'Mi mamá es muy cariñosa', pos: 'noun', gender: 'f' },
      { word: 'el papá', translation: 'папа', example: 'Mi papá me ayuda con la tarea', pos: 'noun', gender: 'm' },
      { word: 'la casa', translation: 'дом', example: 'Vamos a casa a merendar', pos: 'noun', gender: 'f' },
      { word: 'la amiga', translation: 'подруга', example: 'Sofía es mi mejor amiga', pos: 'noun', gender: 'f' },
      { word: 'el amigo', translation: 'друг', example: 'Mateo es un buen amigo', pos: 'noun', gender: 'm' },
      { word: 'el gato', translation: 'кот / кошка', example: 'El gato duerme en el sillón', pos: 'noun', gender: 'm' },
      { word: 'el perro', translation: 'собака', example: 'El perro corre en la plaza', pos: 'noun', gender: 'm' },
      { word: 'jugar', translation: 'играть', example: '¿Querés jugar a la pelota?', pos: 'verb', gender: null },
      { word: 'comer', translation: 'кушать / есть', example: 'Vamos a comer ricas empanadas', pos: 'verb', gender: null },
      { word: 'quiero', translation: 'я хочу', example: 'Quiero un alfajor rico', pos: 'verb', gender: null },
      { word: 'tengo', translation: 'у меня есть', example: 'Tengo una mochila nueva', pos: 'verb', gender: null },
      { word: 'dale', translation: 'давай / ладно', example: '¡Dale, vamos a jugar!', pos: 'interjection', gender: null }
    ]
  },
  {
    name: '🎒 2. Школа и класс',
    isActiveNow: false,
    words: [
      { word: 'la mochila', translation: 'рюкзак / портфель', example: 'Mi mochila es de colores', pos: 'noun', gender: 'f' },
      { word: 'el lápiz', translation: 'карандаш', example: '¿Me prestás un lápiz negro?', pos: 'noun', gender: 'm' },
      { word: 'el cuaderno', translation: 'тетрадь', example: 'Escribo en mi cuaderno de clase', pos: 'noun', gender: 'm' },
      { word: 'la goma', translation: 'ластик / стёрка', example: 'Borro con la goma blanca', pos: 'noun', gender: 'f' },
      { word: 'la tijera', translation: 'ножницы', example: 'Corto papel con la tijera', pos: 'noun', gender: 'f' },
      { word: 'el libro', translation: 'книга', example: 'Leo un libro de cuentos', pos: 'noun', gender: 'm' },
      { word: 'dibujar', translation: 'рисовать', example: 'Me gusta dibujar flores y casas', pos: 'verb', gender: null },
      { word: 'pintar', translation: 'раскрашивать / рисовать красками', example: 'Vamos a pintar con témperas', pos: 'verb', gender: null },
      { word: 'escuchar', translation: 'слушать', example: 'Hay que escuchar a la seño', pos: 'verb', gender: null },
      { word: 'mirar', translation: 'смотреть', example: 'Mirar el pizarrón con atención', pos: 'verb', gender: null },
      { word: 'entender', translation: 'понимать', example: 'Ya entiendo este ejercicio', pos: 'verb', gender: null },
      { word: 'la seño', translation: 'учительница', example: 'La seño nos enseña canciones', pos: 'noun', gender: 'f' },
      { word: 'el recreo', translation: 'перемена', example: '¡Tocó el timbre para el recreo!', pos: 'noun', gender: 'm' },
      { word: 'rojo', translation: 'красный', example: 'Una manzana de color rojo', pos: 'adjective', gender: 'm' },
      { word: 'azul', translation: 'синий / голубой', example: 'El cielo de Buenos Aires es azul', pos: 'adjective', gender: null },
      { word: 'amarillo', translation: 'жёлтый', example: 'El sol brillante es amarillo', pos: 'adjective', gender: 'm' },
      { word: 'verde', translation: 'зелёный', example: 'El pasto de la plaza está verde', pos: 'adjective', gender: null },
      { word: 'blanco', translation: 'белый', example: 'La hoja del cuaderno es blanca', pos: 'adjective', gender: 'm' },
      { word: 'negro', translation: 'чёрный', example: 'Mi perrito tiene manchas negras', pos: 'adjective', gender: 'm' },
      { word: 'los colores', translation: 'цвета', example: 'Tengo una caja de muchos colores', pos: 'noun', gender: 'm' }
    ]
  },
  {
    name: '🍎 3. Еда и киоск',
    isActiveNow: false,
    words: [
      { word: 'el alfajor', translation: 'альфахор (аргентинское печенье)', example: 'Un alfajor de dulce de leche', pos: 'noun', gender: 'm' },
      { word: 'la medialuna', translation: 'медиалуна (круассан)', example: 'Dos medialunas dulces para desayunar', pos: 'noun', gender: 'f' },
      { word: 'el helado', translation: 'мороженое', example: 'Un helado de frutilla y chocolate', pos: 'noun', gender: 'm' },
      { word: 'la leche', translation: 'молоко', example: 'Tomo leche chocolatada tibia', pos: 'noun', gender: 'f' },
      { word: 'el jugo', translation: 'сок', example: 'Un vaso de jugo de naranja natural', pos: 'noun', gender: 'm' },
      { word: 'el pan', translation: 'хлеб', example: 'Pan fresco de la panadería', pos: 'noun', gender: 'm' },
      { word: 'la manzana', translation: 'яблоко', example: 'Una manzana roja y jugosa', pos: 'noun', gender: 'f' },
      { word: 'la banana', translation: 'банан', example: 'Me como una banana en la merienda', pos: 'noun', gender: 'f' },
      { word: 'las galletitas', translation: 'печенье', example: 'Galletitas dulces con chips', pos: 'noun', gender: 'f' },
      { word: 'el chocolate', translation: 'шоколад', example: 'Una tableta de chocolate con leche', pos: 'noun', gender: 'm' },
      { word: 'el queso', translation: 'сыр', example: 'Sándwich de jamón y queso', pos: 'noun', gender: 'm' },
      { word: 'la pizza', translation: 'пицца', example: 'Pizza caliente con mucho queso', pos: 'noun', gender: 'f' },
      { word: 'rico', translation: 'вкусный', example: '¡La comida de mamá está re rica!', pos: 'adjective', gender: 'm' },
      { word: 'el hambre', translation: 'голод', example: 'Tengo mucha hambre, quiero almorzar', pos: 'noun', gender: 'm' },
      { word: 'la sed', translation: 'жажда', example: 'Tengo sed después de correr', pos: 'noun', gender: 'f' },
      { word: 'el quiosco', translation: 'киоск', example: 'Compré caramelos en el quiosco', pos: 'noun', gender: 'm' },
      { word: 'comprar', translation: 'покупать', example: 'Quiero comprar figuritas nuevas', pos: 'verb', gender: null },
      { word: '¿cuánto cuesta?', translation: 'сколько стоит?', example: '¿Cuánto cuesta este alfajor?', pos: 'phrase', gender: null },
      { word: 'la plata', translation: 'деньги', example: 'Acá tengo la plata justa', pos: 'noun', gender: 'f' },
      { word: 'la merienda', translation: 'полдник', example: 'La merienda de la tarde es rica', pos: 'noun', gender: 'f' }
    ]
  },
  {
    name: '🛝 4. Площадка и игры',
    isActiveNow: false,
    words: [
      { word: 'la pelota', translation: 'мяч', example: 'Patear la pelota hacia el arco', pos: 'noun', gender: 'f' },
      { word: 'la plaza', translation: 'парк / площадка', example: 'Vamos a jugar a la plaza del barrio', pos: 'noun', gender: 'f' },
      { word: 'la hamaca', translation: 'качели', example: 'Me hamaco bien alto en la hamaca', pos: 'noun', gender: 'f' },
      { word: 'el tobogán', translation: 'горка', example: 'Me tiro por el tobogán grande', pos: 'noun', gender: 'm' },
      { word: 'correr', translation: 'бегать', example: 'Me gusta correr carreras con amigos', pos: 'verb', gender: null },
      { word: 'saltar', translation: 'прыгать', example: 'Saltar a la soga en el patio', pos: 'verb', gender: null },
      { word: '¡gané!', translation: 'я выиграла!', example: '¡Gané la carrera de hoy!', pos: 'phrase', gender: null },
      { word: 'el turno', translation: 'очередь', example: 'Ahora es mi turno de jugar', pos: 'noun', gender: 'm' },
      { word: 'rápido', translation: 'быстрый / быстро', example: 'Corrés muy rápido', pos: 'adverb', gender: null },
      { word: 'despacio', translation: 'медленный / медленно', example: 'Caminá despacio con cuidado', pos: 'adverb', gender: null },
      { word: 'la mano', translation: 'рука / ладонь', example: 'Dame la mano para cruzar la calle', pos: 'noun', gender: 'f' },
      { word: 'la cabeza', translation: 'голова', example: 'Ponerse la gorra en la cabeza', pos: 'noun', gender: 'f' },
      { word: 'los ojos', translation: 'глаза', example: 'Abro los ojos para ver el dibujo', pos: 'noun', gender: 'm' },
      { word: 'la boca', translation: 'рот', example: 'Abrí la boca para comer la fruta', pos: 'noun', gender: 'f' },
      { word: 'el pie', translation: 'нога / стопа', example: 'Me até los cordones del pie derecho', pos: 'noun', gender: 'm' },
      { word: 'doler', translation: 'болеть', example: 'Me duele la rodilla del golpe', pos: 'verb', gender: null },
      { word: 'cansada', translation: 'уставшая', example: 'Estoy cansada de tanto saltar', pos: 'adjective', gender: 'f' },
      { word: 'feliz', translation: 'счастливая / радостная', example: 'Estoy muy feliz en mi nueva escuela', pos: 'adjective', gender: null },
      { word: 'lindo', translation: 'красивый / милый', example: '¡Qué lindo perrito blanco!', pos: 'adjective', gender: 'm' },
      { word: 'copado', translation: 'классный / крутой', example: 'Este juego nuevo es re copado', pos: 'adjective', gender: 'm' }
    ]
  },
  {
    name: '🏠 5. Семья и дом',
    isActiveNow: false,
    words: [
      { word: 'el hermano', translation: 'брат', example: 'Mi hermano juega conmigo', pos: 'noun', gender: 'm' },
      { word: 'la hermana', translation: 'сестра', example: 'Mi hermana me presta sus juguetes', pos: 'noun', gender: 'f' },
      { word: 'el abuelo', translation: 'дедушка', example: 'El abuelo me cuenta historias lindas', pos: 'noun', gender: 'm' },
      { word: 'la abuela', translation: 'бабушка', example: 'La abuela prepara ricas tortas', pos: 'noun', gender: 'f' },
      { word: 'la cama', translation: 'кровать', example: 'Mi cama es suave y calentita', pos: 'noun', gender: 'f' },
      { word: 'la mesa', translation: 'стол', example: 'Ponemos los platos sobre la mesa', pos: 'noun', gender: 'f' },
      { word: 'la silla', translation: 'стул', example: 'Me siento en la silla para dibujar', pos: 'noun', gender: 'f' },
      { word: 'la puerta', translation: 'дверь', example: 'Abrir la puerta para salir al jardín', pos: 'noun', gender: 'f' },
      { word: 'la ventana', translation: 'окно', example: 'Miro los pajaritos por la ventana', pos: 'noun', gender: 'f' },
      { word: 'el auto', translation: 'машина / автомобиль', example: 'Vamos en auto al supermercado', pos: 'noun', gender: 'm' },
      { word: 'el sol', translation: 'солнце', example: 'El sol calienta la tarde en la plaza', pos: 'noun', gender: 'm' },
      { word: 'la lluvia', translation: 'дождь', example: 'Cuando hay lluvia usamos paraguas', pos: 'noun', gender: 'f' },
      { word: 'el día', translation: 'день', example: '¡Hoy es un día hermoso para pasear!', pos: 'noun', gender: 'm' },
      { word: 'la noche', translation: 'ночь', example: 'A la noche miramos las estrellas', pos: 'noun', gender: 'f' },
      { word: 'grande', translation: 'большой', example: 'Mi mochila nueva es bien grande', pos: 'adjective', gender: null },
      { word: 'chiquito', translation: 'маленький', example: 'El gatito es muy chiquito', pos: 'adjective', gender: 'm' },
      { word: 'esperar', translation: 'ждать', example: 'Esperá un minuto, por favor', pos: 'verb', gender: null },
      { word: 'ayudar', translation: 'помогать', example: 'Me gusta ayudar a mamá en la cocina', pos: 'verb', gender: null },
      { word: 'el calor', translation: 'жара / тепло', example: 'En verano hace mucho calor', pos: 'noun', gender: 'm' },
      { word: 'el frío', translation: 'холод', example: 'En invierno hace frío y uso campera', pos: 'noun', gender: 'm' }
    ]
  }
];

const DEFAULT_EASE_FACTOR = 2.3;
const FUTURE_REVIEW_DATE = '2099-01-01T00:00:00.000Z';

function seedMaya() {
  const now = new Date().toISOString();
  console.log(`Starting Maya profile & 100-word curriculum seed...`);

  // Ensure image_url column exists in vocabulary
  try {
    db.prepare('SELECT image_url FROM vocabulary LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE vocabulary ADD COLUMN image_url TEXT');
    console.log('Added image_url column to vocabulary table');
  }

  // Find or create profile "Майя"
  const mayaName = 'Майя';
  const mayaNameKey = buildProfileNameKey(mayaName);
  let mayaProfile = db.prepare('SELECT * FROM profiles WHERE name_key = ?').get(mayaNameKey);

  if (!mayaProfile) {
    const res = db.prepare(
      'INSERT INTO profiles (name, name_key, avatar_emoji) VALUES (?, ?, ?)'
    ).run(mayaName, mayaNameKey, '👧');
    mayaProfile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(res.lastInsertRowid);
    console.log(`Created profile "Майя" with ID: ${mayaProfile.id}`);
  } else {
    console.log(`Found existing profile "Майя" with ID: ${mayaProfile.id}`);
  }

  const mayaId = mayaProfile.id;

  // Ensure user_settings for Maya
  const existingSettings = db.prepare('SELECT * FROM user_settings WHERE profile_id = ?').get(mayaId);
  if (!existingSettings) {
    db.prepare('INSERT INTO user_settings (profile_id, max_level, dark_mode, notifications_enabled) VALUES (?, ?, ?, ?)').run(
      mayaId, 'A1', 0, 1
    );
    console.log(`Created child user_settings (max_level: A1) for Maya`);
  }

  // Ensure gamification record
  const existingGamification = db.prepare('SELECT * FROM user_gamification WHERE profile_id = ?').get(mayaId);
  if (!existingGamification) {
    db.prepare(`
      INSERT INTO user_gamification (profile_id, xp, streak_days, last_active_date, best_streak, streak_freeze_count)
      VALUES (?, 50, 1, date('now'), 1, 2)
    `).run(mayaId);
    console.log(`Initialized gamification for Maya with 50 starter XP`);
  }

  // Insert groups and words
  let totalInsertedWords = 0;
  let totalGroupMembers = 0;

  const transaction = db.transaction(() => {
    for (const groupDef of GROUPS_DATA) {
      // Find or create group
      let group = db.prepare('SELECT id, name FROM vocabulary_groups WHERE profile_id = ? AND name = ?').get(mayaId, groupDef.name);
      if (!group) {
        const res = db.prepare('INSERT INTO vocabulary_groups (profile_id, name) VALUES (?, ?)').run(mayaId, groupDef.name);
        group = { id: Number(res.lastInsertRowid), name: groupDef.name };
        console.log(`  + Created group: "${group.name}" (ID ${group.id})`);
      } else {
        console.log(`  = Group already exists: "${group.name}" (ID ${group.id})`);
      }

      const groupId = group.id;

      for (const w of groupDef.words) {
        const wordKey = buildVocabularyTextKey(w.word);
        const translationKey = buildVocabularyTextKey(w.translation);

        let vocabEntry = db.prepare(
          'SELECT id FROM vocabulary WHERE profile_id = ? AND word_key = ? AND translation_key = ?'
        ).get(mayaId, wordKey, translationKey);

        const cardNextReview = groupDef.isActiveNow ? now : FUTURE_REVIEW_DATE;
        let vocabId;

        if (!vocabEntry) {
          const insertInfo = db.prepare(`
            INSERT INTO vocabulary (
              word, translation, example, level, next_review, review_count,
              created_at, profile_id, word_key, translation_key,
              is_favorite, cefr_level, part_of_speech, gender
            ) VALUES (
              ?, ?, ?, 0, ?, 0,
              ?, ?, ?, ?,
              0, 'A1', ?, ?
            )
          `).run(
            w.word, w.translation, w.example, cardNextReview,
            now, mayaId, wordKey, translationKey,
            w.pos, w.gender
          );
          vocabId = Number(insertInfo.lastInsertRowid);
          totalInsertedWords++;
        } else {
          vocabId = Number(vocabEntry.id);
        }

        // Ensure review cards (source_to_target and target_to_source)
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
            `).run(vocabId, mayaId, dir, DEFAULT_EASE_FACTOR, cardNextReview, now, now);
          } else {
            // Update next_review_at to match group active state
            db.prepare(`
              UPDATE vocabulary_review_cards
              SET next_review_at = ?
              WHERE id = ?
            `).run(cardNextReview, card.id);
          }
        }

        // Link word to group
        const member = db.prepare(
          'SELECT 1 FROM vocabulary_group_members WHERE group_id = ? AND vocabulary_id = ?'
        ).get(groupId, vocabId);

        if (!member) {
          db.prepare(
            'INSERT INTO vocabulary_group_members (group_id, vocabulary_id, created_at) VALUES (?, ?, ?)'
          ).run(groupId, vocabId, now);
          totalGroupMembers++;
        }
      }
    }
  });

  transaction();

  console.log(`\nSeed completed successfully:`);
  console.log(`- Profile: "Майя" (ID ${mayaId})`);
  console.log(`- Total words for Maya: ${db.prepare('SELECT COUNT(*) as c FROM vocabulary WHERE profile_id = ?').get(mayaId).c}`);
  console.log(`- Words active in Due round now: ${db.prepare("SELECT COUNT(*) as c FROM vocabulary_review_cards WHERE profile_id = ? AND next_review_at <= datetime('now') AND direction = 'source_to_target'").get(mayaId).c}`);
  console.log(`- Words in future standby: ${db.prepare("SELECT COUNT(*) as c FROM vocabulary_review_cards WHERE profile_id = ? AND next_review_at > datetime('now') AND direction = 'source_to_target'").get(mayaId).c}`);
  console.log(`- Groups created: ${db.prepare('SELECT COUNT(*) as c FROM vocabulary_groups WHERE profile_id = ?').get(mayaId).c}`);
}

seedMaya();
db.close();
