import Database from 'better-sqlite3';
import { buildVocabularyTextKey } from '../unicodeKeys.js';

const DB_PATH = process.env.DB_PATH || '/srv/LinguaLearn/spanish/server/spanish_learning.db';
const db = new Database(DB_PATH);

const GOD_PROFILE_ID = 6;
const ALMOST_LEARNED_GROUP_ID = 6;
const DEFAULT_EASE_FACTOR = 2.3;

const PREPOSITIONS = [
  // ==================== Основные простые предлоги (Preposiciones simples) ====================
  {
    word: 'a',
    translation: 'в / на / к (направление: Куда? | Кому? | время)',
    example: 'Voy a la calle (Я иду на улицу). / ¿Adónde vas? — Voy al parque. / Llamo a María. / La clase empieza a las ocho.',
  },
  {
    word: 'en',
    translation: 'в / на (местонахождение: Где? | транспорт | время)',
    example: 'Vivo en esta calle (на этой улице). / Estamos en el café. / Viajo en autobús.',
  },
  {
    word: 'de',
    translation: 'из / от / с (Откуда?) | о / про | чей? (принадлежность) | из чего? (материал)',
    example: 'Vengo de casa (Я иду из дома). / El libro de Juan (Книга Хуана). / Hablamos de música. / Mesa de madera.',
  },
  {
    word: 'con',
    translation: 'с / со (совместность: с кем? | инструмент: чем?)',
    example: 'Voy al cine con mis amigos (Иду в кино с друзьями). / Escribo con un bolígrafo.',
  },
  {
    word: 'sin',
    translation: 'без (отсутствие кого-то или чего-то)',
    example: 'Tomo café sin azúcar (Я пью кофе без сахара). / No salgo sin chaqueta.',
  },
  {
    word: 'por',
    translation: 'по / из-за / через / ради / за / на протяжении (причина, маршрут, время)',
    example: 'Camino por el parque (Гуляю по парку). / Gracias por tu ayuda (Спасибо за помощь). / Por la mañana.',
  },
  {
    word: 'para',
    translation: 'для / чтобы / по направлению к / к (цель, назначение, адресат, срок)',
    example: 'Este regalo es para ti (Этот подарок для тебя). / Estudio para aprender. / Es para mañana.',
  },
  {
    word: 'hacia',
    translation: 'по направлению к / в сторону (Куда?) | около (времени)',
    example: 'Camino hacia el centro (Я иду по направлению к центру). / El tren va hacia el norte. / Llegaré hacia las seis.',
  },
  {
    word: 'hasta',
    translation: 'до / вплоть до (предел во времени или пространстве)',
    example: 'Camino hasta el parque (Иду до парка). / La tienda abre hasta las diez. / ¡Hasta pronto!',
  },
  {
    word: 'desde',
    translation: 'от / с / начиная с (исходная точка в пространстве или времени)',
    example: 'Trabajo desde las nueve (Работаю с девяти). / Desde mi ventana veo el mar.',
  },
  {
    word: 'sobre',
    translation: 'на / над (на поверхности) | о / про (тема) | около (времени, чисел)',
    example: 'El libro está sobre la mesa (Книга на столе). / Hablamos sobre el viaje. / Llegó sobre las tres.',
  },
  {
    word: 'bajo',
    translation: 'под (ниже чего-то) | при (условии)',
    example: 'El gato duerme bajo la mesa (Кот спит под столом). / La temperatura está bajo cero.',
  },
  {
    word: 'entre',
    translation: 'между / среди',
    example: 'El café está entre el banco y el hotel (Кафе между банком и отелем). / Entre nosotros.',
  },
  {
    word: 'contra',
    translation: 'против | о / об (столкновение)',
    example: 'Jugamos contra un equipo fuerte (Играем против сильной команды). / Chocó contra la pared.',
  },
  {
    word: 'según',
    translation: 'согласно / по (словам, мнению) | в зависимости от',
    example: 'Según el periódico, va a llover (По прогнозу в газете, будет дождь). / Según mi opinión.',
  },
  {
    word: 'tras',
    translation: 'после / за / позади (следом за)',
    example: 'Tras la tormenta sale el sol (После бури выходит солнце). / Día tras día (День за днем).',
  },
  {
    word: 'ante',
    translation: 'перед / перед лицом (фактов, трудностей, людей)',
    example: 'Habló ante el público (Он выступал перед публикой). / Ante el peligro mantén la calma.',
  },
  {
    word: 'durante',
    translation: 'во время / в течение / на протяжении',
    example: 'Estudio español durante el día (Я учу испанский в течение дня). / Durante el verano.',
  },
  {
    word: 'mediante',
    translation: 'посредством / с помощью / путем',
    example: 'Lo resolvieron mediante el diálogo (Они решили это путем диалога).',
  },
  {
    word: 'salvo',
    translation: 'кроме / за исключением',
    example: 'Todos vinieron salvo Juan (Все пришли, кроме Хуана).',
  },
  {
    word: 'excepto',
    translation: 'кроме / за исключением',
    example: 'Abierto todos los días excepto los domingos (Открыто каждый день, кроме воскресенья).',
  },

  // ==================== Важнейшие предложные сочетания (Locuciones preposicionales) ====================
  {
    word: 'delante de',
    translation: 'впереди / перед (в пространстве)',
    example: 'Hay un coche delante de la casa (Перед домом стоит машина).',
  },
  {
    word: 'detrás de',
    translation: 'сзади / позади / за (в пространстве)',
    example: 'El jardín está detrás de la casa (Сад находится позади дома).',
  },
  {
    word: 'encima de',
    translation: 'на / сверху / поверх (на поверхности)',
    example: 'Las llaves están encima de la mesa (Ключи лежат на столе).',
  },
  {
    word: 'debajo de',
    translation: 'под / внизу',
    example: 'La pelota está debajo de la cama (Мяч лежит под кроватью).',
  },
  {
    word: 'al lado de',
    translation: 'рядом с / около / сбоку от',
    example: 'El banco está al lado del supermercado (Банк рядом с супермаркетом).',
  },
  {
    word: 'cerca de',
    translation: 'близко к / недалеко от / рядом с',
    example: 'Vivo cerca de la estación (Я живу близко от вокзала / рядом с вокзалом).',
  },
  {
    word: 'lejos de',
    translation: 'далеко от',
    example: 'La casa está lejos del centro (Дом далеко от центра).',
  },
  {
    word: 'enfrente de',
    translation: 'напротив / перед',
    example: 'La farmacia está enfrente del hotel (Аптека находится напротив отеля).',
  },
  {
    word: 'frente a',
    translation: 'напротив / перед лицом',
    example: 'La terraza está frente al mar (Терраса находится напротив моря / выходит на море).',
  },
  {
    word: 'alrededor de',
    translation: 'вокруг / около (в пространстве или во времени)',
    example: 'Caminamos alrededor del parque (Мы гуляем вокруг парка). / Llegaré alrededor de las siete.',
  },
  {
    word: 'dentro de',
    translation: 'внутри / в (место) | через (о времени)',
    example: 'Las llaves están dentro del bolso (Ключи внутри сумки). / Llego dentro de diez minutos (Приеду через 10 минут).',
  },
  {
    word: 'fuera de',
    translation: 'снаружи / вне / за пределами',
    example: 'Estamos fuera de la ciudad (Мы находимся за пределами города / вне города).',
  },
  {
    word: 'a través de',
    translation: 'через / сквозь / посредством',
    example: 'Miro a través de la ventana (Я смотрю через окно / сквозь окно).',
  },
  {
    word: 'junto a',
    translation: 'рядом с / возле / у',
    example: 'Siéntate junto a mí (Сядь рядом со мной). / La casa está junto al parque.',
  },
  {
    word: 'a favor de',
    translation: 'в пользу / за (в поддержку)',
    example: 'Estoy a favor de esta propuesta (Я за это предложение).',
  },
  {
    word: 'en contra de',
    translation: 'против (в несогласие)',
    example: 'Estoy en contra de esa decisión (Я против этого решения).',
  },
  {
    word: 'gracias a',
    translation: 'благодаря (кому / чему)',
    example: 'Aprobé el examen gracias a tu ayuda (Я сдал экзамен благодаря твоей помощи).',
  },
  {
    word: 'a pesar de',
    translation: 'несмотря на / вопреки',
    example: 'Salimos a caminar a pesar de la lluvia (Мы вышли на прогулку, несмотря на дождь).',
  },
  {
    word: 'en vez de',
    translation: 'вместо (кого / чего-либо)',
    example: 'Tomé té en vez de café (Я выпил чай вместо кофе).',
  },
  {
    word: 'en lugar de',
    translation: 'вместо того чтобы / вместо',
    example: 'En lugar de descansar, siguió trabajando (Вместо отдыха он продолжил работать).',
  },
  {
    word: 'a partir de',
    translation: 'начиная с / с (момента времени или точки)',
    example: 'A partir de mañana empiezo la rutina (Начиная с завтрашнего дня начинаю режим).',
  },
  {
    word: 'acerca de',
    translation: 'о / про / насчет / касательно',
    example: 'Leí un artículo acerca de España (Я прочитал статью об Испании).',
  },
  {
    word: 'en medio de',
    translation: 'посреди / среди / в центре',
    example: 'Hay una fuente en medio de la plaza (Посреди площади есть фонтан).',
  },
  {
    word: 'debido a',
    translation: 'из-за / по причине',
    example: 'El vuelo se canceló debido al mal tiempo (Рейс отменили из-за плохой погоды).',
  },
  {
    word: 'en cuanto a',
    translation: 'что касается / относительно',
    example: 'En cuanto al precio, es muy razonable (Что касается цены, она очень разумная).',
  },
  {
    word: 'respecto a',
    translation: 'относительно / что касается / по поводу',
    example: 'Tengo una pregunta respecto al horario (У меня вопрос по поводу расписания).',
  },
  {
    word: 'al fondo de',
    translation: 'в глубине / в конце (помещения, коридора)',
    example: 'El baño está al fondo del pasillo (Туалет в конце коридора).',
  },
];

const now = new Date().toISOString();

const run = db.transaction(() => {
  // Check God profile
  const profile = db.prepare('SELECT id, name FROM profiles WHERE id = ?').get(GOD_PROFILE_ID);
  if (!profile) {
    throw new Error(`Profile ${GOD_PROFILE_ID} not found`);
  }
  console.log(`Target profile: ID ${profile.id}, Name: ${profile.name}`);

  // Check group
  const group = db.prepare('SELECT id, name FROM vocabulary_groups WHERE id = ? AND profile_id = ?').get(ALMOST_LEARNED_GROUP_ID, GOD_PROFILE_ID);
  if (!group) {
    throw new Error(`Group ${ALMOST_LEARNED_GROUP_ID} not found for profile ${GOD_PROFILE_ID}`);
  }
  console.log(`Target group: ID ${group.id}, Name: ${group.name}`);

  let insertedCount = 0;
  let updatedCount = 0;
  let addedToGroupCount = 0;

  for (const item of PREPOSITIONS) {
    const wordKey = buildVocabularyTextKey(item.word);
    const translationKey = buildVocabularyTextKey(item.translation);

    // Find existing by word key for this profile
    const existing = db.prepare(`
      SELECT id, word, translation, example 
      FROM vocabulary 
      WHERE profile_id = ? AND word_key = ?
    `).get(GOD_PROFILE_ID, wordKey);

    let vocabId;

    if (existing) {
      vocabId = existing.id;
      db.prepare(`
        UPDATE vocabulary 
        SET word = ?, translation = ?, translation_key = ?, example = ?
        WHERE id = ? AND profile_id = ?
      `).run(item.word, item.translation, translationKey, item.example, vocabId, GOD_PROFILE_ID);
      updatedCount++;
      console.log(`[UPDATE] ID ${vocabId}: "${item.word}" -> "${item.translation}"`);
    } else {
      const result = db.prepare(`
        INSERT INTO vocabulary (
          word,
          word_key,
          translation,
          translation_key,
          example,
          level,
          next_review,
          review_count,
          last_reviewed,
          created_at,
          profile_id,
          is_favorite
        )
        VALUES (?, ?, ?, ?, ?, 0, ?, 0, NULL, ?, ?, 0)
      `).run(item.word, wordKey, item.translation, translationKey, item.example, now, now, GOD_PROFILE_ID);

      vocabId = result.lastInsertRowid;
      insertedCount++;
      console.log(`[INSERT] ID ${vocabId}: "${item.word}" -> "${item.translation}"`);
    }

    // Ensure review cards exist
    const directions = ['source_to_target', 'target_to_source'];
    for (const dir of directions) {
      const card = db.prepare(`
        SELECT id FROM vocabulary_review_cards 
        WHERE vocabulary_id = ? AND direction = ?
      `).get(vocabId, dir);

      if (!card) {
        db.prepare(`
          INSERT INTO vocabulary_review_cards (
            vocabulary_id,
            profile_id,
            direction,
            state,
            review_count,
            lapse_count,
            interval_days,
            ease_factor,
            next_review_at,
            learned_until,
            last_reviewed_at,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, 'new', 0, 0, 0, ?, ?, NULL, NULL, ?, ?)
        `).run(vocabId, GOD_PROFILE_ID, dir, DEFAULT_EASE_FACTOR, now, now, now);
      }
    }

    // Ensure added to group 6
    const inGroup = db.prepare(`
      SELECT 1 FROM vocabulary_group_members 
      WHERE group_id = ? AND vocabulary_id = ?
    `).get(ALMOST_LEARNED_GROUP_ID, vocabId);

    if (!inGroup) {
      db.prepare(`
        INSERT INTO vocabulary_group_members (group_id, vocabulary_id, created_at)
        VALUES (?, ?, ?)
      `).run(ALMOST_LEARNED_GROUP_ID, vocabId, now);
      addedToGroupCount++;
      console.log(`  + Added to group '${group.name}': ID ${vocabId} (${item.word})`);
    } else {
      console.log(`  = Already in group '${group.name}': ID ${vocabId} (${item.word})`);
    }
  }

  console.log(`\n--- SUMMARY ---`);
  console.log(`Total prepositions processed: ${PREPOSITIONS.length}`);
  console.log(`Inserted new: ${insertedCount}`);
  console.log(`Updated existing: ${updatedCount}`);
  console.log(`Newly linked to '${group.name}': ${addedToGroupCount}`);
});

run();
db.close();
