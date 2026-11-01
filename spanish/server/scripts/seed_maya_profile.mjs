import Database from 'better-sqlite3';
import { buildVocabularyTextKey, buildProfileNameKey } from '../unicodeKeys.js';

const DB_PATH = process.env.DB_PATH || '/srv/LinguaLearn/spanish/server/spanish_learning.db';
const db = new Database(DB_PATH);

const GROUPS_DATA = [
  // ---------------- PART 1: Initial 10 groups (10 words each = 100 words) ----------------
  {
    name: '🌟 1. Первые слова (Старт)',
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
      { word: 'el papá', translation: 'папа', example: 'Mi papá me ayuda con la tarea', pos: 'noun', gender: 'm' }
    ]
  },
  {
    name: '🏠 2. Мой мир и друзья',
    isActiveNow: false,
    words: [
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
    name: '🎒 3. Школьный рюкзак',
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
      { word: 'mirar', translation: 'смотреть', example: 'Mirar el pizarrón con atención', pos: 'verb', gender: null }
    ]
  },
  {
    name: '🎨 4. Школа и цвета',
    isActiveNow: false,
    words: [
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
    name: '🥐 5. Сладости и завтрак',
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
      { word: 'el chocolate', translation: 'шоколад', example: 'Una tableta de chocolate con leche', pos: 'noun', gender: 'm' }
    ]
  },
  {
    name: '🏪 6. Киоск и перекус',
    isActiveNow: false,
    words: [
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
    name: '🛝 7. Площадка и игры',
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
      { word: 'despacio', translation: 'медленный / медленно', example: 'Caminá despacio con cuidado', pos: 'adverb', gender: null }
    ]
  },
  {
    name: '🧘‍♀️ 8. Тело и эмоции',
    isActiveNow: false,
    words: [
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
    name: '👨‍👩‍👧 9. Семья и дом',
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
      { word: 'el auto', translation: 'машина / автомобиль', example: 'Vamos en auto al supermercado', pos: 'noun', gender: 'm' }
    ]
  },
  {
    name: '☀️ 10. Природа и погода',
    isActiveNow: false,
    words: [
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
  },

  // ---------------- PART 2: 20 New groups suitable for 12 y.o. Maya (5 words each = 100 words) ----------------
  {
    name: '📱 11. Телефон и гаджеты',
    isActiveNow: false,
    words: [
      { word: 'el celular', translation: 'мобильный телефон / сотовый', example: 'Miro un video divertido en el celular', example_translation: 'Я смотрю весёлое видео на телефоне', pos: 'noun', gender: 'm' },
      { word: 'la foto', translation: 'фотография / фото', example: 'Sacamos una foto linda con amigas', example_translation: 'Мы сделали красивое фото с подругами', pos: 'noun', gender: 'f' },
      { word: 'el mensaje', translation: 'сообщение', example: 'Te mandé un mensaje por chat', example_translation: 'Я отправила тебе сообщение в чате', pos: 'noun', gender: 'm' },
      { word: 'la pantalla', translation: 'экран', example: 'La pantalla de la tablet es grande', example_translation: 'Экран планшета большой', pos: 'noun', gender: 'f' },
      { word: 'mandar', translation: 'отправлять / посылать', example: '¿Me mandás un audio, por favor?', example_translation: 'Отправишь мне голосовое, пожалуйста?', pos: 'verb', gender: null }
    ]
  },
  {
    name: '🎵 12. Музыка и танцы',
    isActiveNow: false,
    words: [
      { word: 'la música', translation: 'музыка', example: 'Me encanta escuchar música pop', example_translation: 'Я обожаю слушать поп-музыку', pos: 'noun', gender: 'f' },
      { word: 'la canción', translation: 'песня', example: 'Esta canción es re pegadiza', example_translation: 'Эта песня очень прилипчивая', pos: 'noun', gender: 'f' },
      { word: 'cantar', translation: 'петь', example: 'Nos gusta cantar en el coro escolar', example_translation: 'Нам нравится петь в школьном хоре', pos: 'verb', gender: null },
      { word: 'bailar', translation: 'танцевать', example: 'Vamos a bailar en la fiesta', example_translation: 'Давай танцевать на празднике', pos: 'verb', gender: null },
      { word: 'los auriculares', translation: 'наушники', example: 'Me pongo los auriculares para viajar', example_translation: 'Я надеваю наушники для поездки', pos: 'noun', gender: 'm' }
    ]
  },
  {
    name: '👗 13. Одежда и стиль',
    isActiveNow: false,
    words: [
      { word: 'la remera', translation: 'футболка', example: 'Me pongo una remera violeta cómoda', example_translation: 'Я надеваю удобную фиолетовую футболку', pos: 'noun', gender: 'f' },
      { word: 'el pantalón', translation: 'брюки / штаны', example: 'Este pantalón me queda re bien', example_translation: 'Эти штаны сидят на мне отлично', pos: 'noun', gender: 'm' },
      { word: 'la campera', translation: 'куртка', example: 'Llevá la campera porque refrescó', example_translation: 'Возьми куртку, потому что похолодало', pos: 'noun', gender: 'f' },
      { word: 'el vestido', translation: 'платье', example: 'Un vestido lindo para la fiesta', example_translation: 'Красивое платье для праздника', pos: 'noun', gender: 'm' },
      { word: 'la zapatilla', translation: 'кроссовок / кед', example: 'Mis zapatillas nuevas son blancas', example_translation: 'Мои новые кроссовки белые', pos: 'noun', gender: 'f' }
    ]
  },
  {
    name: '✍️ 14. Письмо и секреты',
    isActiveNow: false,
    words: [
      { word: 'escribir', translation: 'писать', example: 'Me gusta escribir cartas y cuentos', example_translation: 'Мне нравится писать письма и рассказы', pos: 'verb', gender: null },
      { word: 'la carta', translation: 'письмо', example: 'Escribí una carta para mi amiga', example_translation: 'Я написала письмо для подруги', pos: 'noun', gender: 'f' },
      { word: 'la palabra', translation: 'слово', example: 'Aprendí una palabra nueva en español', example_translation: 'Я выучила новое слово на испанском', pos: 'noun', gender: 'f' },
      { word: 'la historia', translation: 'история / рассказ', example: 'Contame una historia divertida', example_translation: 'Расскажи мне забавную историю', pos: 'noun', gender: 'f' },
      { word: 'el secreto', translation: 'секрет / тайна', example: 'Te cuento un secreto al oído', example_translation: 'Я скажу тебе секрет на ушко', pos: 'noun', gender: 'm' }
    ]
  },
  {
    name: '🚪 15. Дома и в комнате',
    isActiveNow: false,
    words: [
      { word: 'abrir', translation: 'открывать', example: 'Abrí la ventana para que entre aire', example_translation: 'Открой окно, чтобы вошёл воздух', pos: 'verb', gender: null },
      { word: 'cerrar', translation: 'закрывать', example: 'Cerrá la puerta al salir, por favor', example_translation: 'Закрой дверь при выходе, пожалуйста', pos: 'verb', gender: null },
      { word: 'la habitación', translation: 'комната', example: 'Mi habitación está ordenada y limpia', example_translation: 'Моя комната убранная и чистая', pos: 'noun', gender: 'f' },
      { word: 'el espejo', translation: 'зеркало', example: 'Me miro al espejo antes de salir', example_translation: 'Я смотрюсь в зеркало перед выходом', pos: 'noun', gender: 'm' },
      { word: 'la luz', translation: 'свет', example: 'Prendé la luz del escritorio', example_translation: 'Включи свет на письменном столе', pos: 'noun', gender: 'f' }
    ]
  },
  {
    name: '🏙️ 16. Город и жизнь',
    isActiveNow: false,
    words: [
      { word: 'vivir', translation: 'жить', example: 'Vivo en un barrio tranquilo y lindo', example_translation: 'Я живу в тихом и красивом районе', pos: 'verb', gender: null, image_url: '/spanish/images/vocab/vivir.jpg' },
      { word: 'la ciudad', translation: 'город', example: 'Buenos Aires es una gran ciudad', example_translation: 'Буэнос-Айрес — большой город', pos: 'noun', gender: 'f' },
      { word: 'la calle', translation: 'улица', example: 'Cruzamos la calle con cuidado', example_translation: 'Мы переходим улицу осторожно', pos: 'noun', gender: 'f', image_url: '/spanish/images/vocab/calle.jpg' },
      { word: 'el barrio', translation: 'район / квартал', example: 'En mi barrio hay muchas plazas', example_translation: 'В моём районе много парков', pos: 'noun', gender: 'm' },
      { word: 'la tienda', translation: 'магазин', example: 'Compré ropa linda en la tienda', example_translation: 'Я купила красивую одежду в магазине', pos: 'noun', gender: 'f' }
    ]
  },
  {
    name: '🚶‍♀️ 17. Прогулка и встречи',
    isActiveNow: false,
    words: [
      { word: 'salir', translation: 'выходить / гулять', example: '¿Podemos salir a caminar un rato?', example_translation: 'Мы можем выйти погулять немного?', pos: 'verb', gender: null },
      { word: 'caminar', translation: 'гулять / ходить пешком', example: 'Me gusta caminar por la tarde', example_translation: 'Мне нравится гулять во второй половине дня', pos: 'verb', gender: null },
      { word: 'llegar', translation: 'приходить / приезжать', example: 'Llego a casa después de la escuela', example_translation: 'Я прихожу домой после школы', pos: 'verb', gender: null },
      { word: 'la tarde', translation: 'день (после полудня) / вечер', example: 'A la tarde hacemos los deberes', example_translation: 'Днём мы делаем уроки', pos: 'noun', gender: 'f' },
      { word: 'el parque', translation: 'парк', example: 'Paseamos a los perros en el parque', example_translation: 'Мы выгуливаем собак в парке', pos: 'noun', gender: 'm' }
    ]
  },
  {
    name: '🛌 18. Сон и отдых',
    isActiveNow: false,
    words: [
      { word: 'dormir', translation: 'спать', example: 'Los fines de semana me gusta dormir más', example_translation: 'По выходным мне нравится спать подольше', pos: 'verb', gender: null },
      { word: 'el sueño', translation: 'сон / мечта', example: 'Tengo mucho sueño, me voy a acostar', example_translation: 'Я очень хочу спать, пойду лягу', pos: 'noun', gender: 'm' },
      { word: 'descansar', translation: 'отдыхать', example: 'Vamos a descansar un ratito en el sillón', example_translation: 'Давай отдохнём немного в кресле', pos: 'verb', gender: null },
      { word: 'despertar', translation: 'просыпаться / будить', example: 'Me despierto temprano para ir a clase', example_translation: 'Я просыпаюсь рано, чтобы идти на уроки', pos: 'verb', gender: null },
      { word: 'la almohada', translation: 'подушка', example: 'Mi almohada es muy suave', example_translation: 'Моя подушка очень мягкая', pos: 'noun', gender: 'f' }
    ]
  },
  {
    name: '🤝 19. Дружба и забота',
    isActiveNow: false,
    words: [
      { word: 'compartir', translation: 'делиться', example: 'Es lindo compartir los caramelos con amigos', example_translation: 'Приятно делиться конфетами с друзьями', pos: 'verb', gender: null },
      { word: 'el abrazo', translation: 'объятие', example: 'Te doy un abrazo fuerte y cálido', example_translation: 'Крепко обнимаю тебя', pos: 'noun', gender: 'm' },
      { word: 'abrazar', translation: 'обнимать', example: 'Me gusta abrazar a mis abuelos', example_translation: 'Мне нравится обнимать бабушку и дедушку', pos: 'verb', gender: null },
      { word: 'sonreír', translation: 'улыбаться', example: 'Sonreír te hace ver muy feliz', example_translation: 'Улыбка делает тебя очень счастливой', pos: 'verb', gender: null },
      { word: 'el corazón', translation: 'сердце', example: 'Lo digo de todo corazón', example_translation: 'Я говорю это от всего сердца', pos: 'noun', gender: 'm' }
    ]
  },
  {
    name: '🐾 20. Животные и питомцы',
    isActiveNow: false,
    words: [
      { word: 'el conejo', translation: 'кролик', example: 'El conejo blanco come zanahorias', example_translation: 'Белый кролик ест морковку', pos: 'noun', gender: 'm' },
      { word: 'el pájaro', translation: 'птица / птичка', example: 'El pájaro canta en la rama', example_translation: 'Птица поёт на ветке', pos: 'noun', gender: 'm' },
      { word: 'el caballo', translation: 'лошадь / конь', example: 'Un caballo marrón galopa en el campo', example_translation: 'Коричневая лошадь скачет в поле', pos: 'noun', gender: 'm' },
      { word: 'el pez', translation: 'рыба / рыбка', example: 'El pez nada en la pecera redonda', example_translation: 'Рыбка плавает в круглом аквариуме', pos: 'noun', gender: 'm' },
      { word: 'el delfín', translation: 'дельфин', example: 'Vimos un delfín saltando en el agua', example_translation: 'Мы видели дельфина, прыгающего в воде', pos: 'noun', gender: 'm' }
    ]
  },
  {
    name: '📚 21. Школьные уроки',
    isActiveNow: false,
    words: [
      { word: 'la clase', translation: 'урок / класс', example: 'La clase de ciencias fue interesante', example_translation: 'Урок естествознания был интересным', pos: 'noun', gender: 'f' },
      { word: 'la tarea', translation: 'домашнее задание / уроки', example: 'Terminé toda la tarea temprano', example_translation: 'Я сделала всё домашнее задание рано', pos: 'noun', gender: 'f' },
      { word: 'aprender', translation: 'учить / учиться', example: 'Quiero aprender muchas cosas nuevas', example_translation: 'Я хочу научиться многому новому', pos: 'verb', gender: null },
      { word: 'la pregunta', translation: 'вопрос', example: 'Tengo una pregunta para la seño', example_translation: 'У меня вопрос к учительнице', pos: 'noun', gender: 'f' },
      { word: 'la respuesta', translation: 'ответ', example: 'Sé la respuesta correcta del ejercicio', example_translation: 'Я знаю правильный ответ к упражнению', pos: 'noun', gender: 'f' }
    ]
  },
  {
    name: '💻 22. Компьютер и интернет',
    isActiveNow: false,
    words: [
      { word: 'la computadora', translation: 'компьютер', example: 'Uso la computadora para hacer trabajos', example_translation: 'Я использую компьютер для выполнения заданий', pos: 'noun', gender: 'f' },
      { word: 'el video', translation: 'видео', example: 'Grabamos un video divertido con amigas', example_translation: 'Мы записали забавное видео с подругами', pos: 'noun', gender: 'm' },
      { word: 'el juego', translation: 'игра', example: 'Este juego de aventuras es atrapante', example_translation: 'Эта приключенческая игра захватывающая', pos: 'noun', gender: 'm' },
      { word: 'la red', translation: 'сеть / интернет', example: 'Buscamos información en la red', example_translation: 'Мы ищем информацию в сети', pos: 'noun', gender: 'f' },
      { word: 'buscar', translation: 'искать', example: 'Voy a buscar mi cartuchera favorita', example_translation: 'Я пойду поищу свой любимый пенал', pos: 'verb', gender: null }
    ]
  },
  {
    name: '🍔 23. Обед и кафе',
    isActiveNow: false,
    words: [
      { word: 'las papas fritas', translation: 'картошка фри', example: 'Pedimos una porción de papas fritas', example_translation: 'Мы заказали порцию картошки фри', pos: 'noun', gender: 'f' },
      { word: 'la hamburguesa', translation: 'гамбургер / бургер', example: 'Una hamburguesa casera con queso', example_translation: 'Домашний бургер с сыром', pos: 'noun', gender: 'f' },
      { word: 'la ensalada', translation: 'салат', example: 'Ensalada fresca de tomate y lechuga', example_translation: 'Свежий салат из помидоров и салата', pos: 'noun', gender: 'f' },
      { word: 'la fruta', translation: 'фрукты / фрукт', example: 'Comer fruta todos los días es sano', example_translation: 'Есть фрукты каждый день полезно', pos: 'noun', gender: 'f' },
      { word: 'la frutilla', translation: 'клубника', example: 'Helado de crema americana con frutillas', example_translation: 'Сливочное мороженое с клубникой', pos: 'noun', gender: 'f' }
    ]
  },
  {
    name: '🥤 24. Напитки и сладости',
    isActiveNow: false,
    words: [
      { word: 'el té', translation: 'чай', example: 'Tomo un té con miel calentito', example_translation: 'Я пью тёплый чай с мёдом', pos: 'noun', gender: 'm' },
      { word: 'el mate', translation: 'мате', example: 'Mamá ceba mate con menta', example_translation: 'Мама наливает мате с мятой', pos: 'noun', gender: 'm' },
      { word: 'la torta', translation: 'торт / пирог', example: 'Una torta rica de cumpleaños', example_translation: 'Вкусный праздничный торт на день рождения', pos: 'noun', gender: 'f' },
      { word: 'el caramelo', translation: 'конфета / леденец', example: 'Elegí un caramelo sabor a frutilla', example_translation: 'Я выбрала конфету со вкусом клубники', pos: 'noun', gender: 'm' },
      { word: 'dulce', translation: 'сладкий', example: 'El dulce de leche es delicioso', example_translation: 'Дульсе де лече очень сладкий и вкусный', pos: 'adjective', gender: null }
    ]
  },
  {
    name: '🚲 25. Спорт и активный отдых',
    isActiveNow: false,
    words: [
      { word: 'la bicicleta', translation: 'велосипед', example: 'Andar en bicicleta los fines de semana', example_translation: 'Кататься на велосипеде по выходным', pos: 'noun', gender: 'f' },
      { word: 'nadar', translation: 'плавать', example: 'Me gusta nadar en la pileta cuando hace calor', example_translation: 'Мне нравится плавать в бассейне, когда жарко', pos: 'verb', gender: null },
      { word: 'el patín', translation: 'ролик / конёк / скейтборд', example: 'Salgo con los patines por la costanera', example_translation: 'Я катаюсь на роликах по набережной', pos: 'noun', gender: 'm' },
      { word: 'la pileta', translation: 'бассейн', example: 'Nos tiramos a la pileta en verano', example_translation: 'Мы прыгаем в бассейн летом', pos: 'noun', gender: 'f' },
      { word: 'el equipo', translation: 'команда', example: 'Jugamos todas juntas en el mismo equipo', example_translation: 'Мы все вместе играем в одной команде', pos: 'noun', gender: 'm' }
    ]
  },
  {
    name: '⏰ 26. Время и дни',
    isActiveNow: false,
    words: [
      { word: 'la hora', translation: 'час / время', example: '¿Qué hora es? Ya casi son las cuatro', example_translation: 'Который час? Уже почти четыре', pos: 'noun', gender: 'f' },
      { word: 'la semana', translation: 'неделя', example: 'Esta semana tenemos muchos planes divertidos', example_translation: 'На этой неделе у нас много весёлых планов', pos: 'noun', gender: 'f' },
      { word: 'hoy', translation: 'сегодня', example: 'Hoy es un día hermoso y soleado', example_translation: 'Сегодня прекрасный и солнечный день', pos: 'adverb', gender: null },
      { word: 'mañana', translation: 'завтра / утро', example: 'Mañana nos vemos en la escuela', example_translation: 'Завтра увидимся в школе', pos: 'adverb', gender: null },
      { word: 'el fin de semana', translation: 'выходные / уикенд', example: 'El fin de semana vamos de paseo', example_translation: 'На выходных мы поедем на прогулку', pos: 'noun', gender: 'm' }
    ]
  },
  {
    name: '🌸 27. Природа вокруг нас',
    isActiveNow: false,
    words: [
      { word: 'la flor', translation: 'цветок', example: 'Una flor violeta perfumada en el jardín', example_translation: 'Ароматный фиолетовый цветок в саду', pos: 'noun', gender: 'f' },
      { word: 'el árbol', translation: 'дерево', example: 'Un árbol grande que da linda sombra', example_translation: 'Большое дерево, дающее приятную тень', pos: 'noun', gender: 'm' },
      { word: 'el mar', translation: 'море', example: 'Las olas del mar suenan tranquilas', example_translation: 'Морские волны звучат спокойно', pos: 'noun', gender: 'm' },
      { word: 'la playa', translation: 'пляж', example: 'Hacemos castillos de arena en la playa', example_translation: 'Мы строим замки из песка на пляже', pos: 'noun', gender: 'f' },
      { word: 'la luna', translation: 'луна', example: 'La luna brilla clara en la noche', example_translation: 'Луна ярко светит в ночи', pos: 'noun', gender: 'f' }
    ]
  },
  {
    name: '🎬 28. Кино и творчество',
    isActiveNow: false,
    words: [
      { word: 'la película', translation: 'фильм / кино', example: 'Vimos una película animada hermosa', example_translation: 'Мы посмотрели чудесный мультфильм', pos: 'noun', gender: 'f' },
      { word: 'la actriz', translation: 'актриса', example: 'Mi actriz favorita actúa muy bien', example_translation: 'Моя любимая актриса отлично играет', pos: 'noun', gender: 'f' },
      { word: 'el cine', translation: 'кинотеатр / кино', example: 'Vamos al cine a comer pochoclos', example_translation: 'Пойдём в кинотеатр кушать попкорн', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/cine.jpg' },
      { word: 'actuar', translation: 'выступать / играть роль', example: 'Me divierte actuar en las obras de teatro', example_translation: 'Мне весело выступать в театральных постановках', pos: 'verb', gender: null },
      { word: 'la estrella', translation: 'звезда', example: 'Miro una estrella fugaz en el cielo', example_translation: 'Я смотрю на падающую звезду в небе', pos: 'noun', gender: 'f' }
    ]
  },
  {
    name: '💬 29. Разговор и вежливость',
    isActiveNow: false,
    words: [
      { word: '¿cómo estás?', translation: 'как дела? / как поживаешь?', example: '¡Hola, Sofi! ¿Cómo estás hoy?', example_translation: 'Привет, Софи! Как ты сегодня?', pos: 'phrase', gender: null, image_url: '/spanish/images/vocab/cómo_estás.jpg' },
      { word: 'bien', translation: 'хорошо', example: 'Todo está muy bien, gracias', example_translation: 'Всё очень хорошо, спасибо', pos: 'adverb', gender: null, image_url: '/spanish/images/vocab/bien.jpg' },
      { word: 'de nada', translation: 'не за что / пожалуйста (в ответ)', example: '—Muchas gracias. —¡De nada!', example_translation: '—Большое спасибо. —Не за что!', pos: 'phrase', gender: null },
      { word: 'perdón', translation: 'извини / прости', example: 'Perdón, no me di cuenta', example_translation: 'Извини, я не заметила', pos: 'interjection', gender: null, image_url: '/spanish/images/vocab/perdón.jpg' },
      { word: 'hasta luego', translation: 'до встречи / пока', example: 'Hasta luego, nos vemos pronto', example_translation: 'До встречи, скоро увидимся', pos: 'phrase', gender: null }
    ]
  },
  {
    name: '🌟 30. Эмоции и характер',
    isActiveNow: false,
    words: [
      { word: 'divertido', translation: 'весёлый / забавный', example: 'El paseo con amigas fue muy divertido', example_translation: 'Прогулка с подругами была очень весёлой', pos: 'adjective', gender: 'm' },
      { word: 'tranquila', translation: 'спокойная', example: 'Estoy tranquila leyendo en mi cuarto', example_translation: 'Я спокойно читаю в своей комнате', pos: 'adjective', gender: 'f' },
      { word: 'inteligente', translation: 'умная / сообразительная', example: 'Es una chica muy inteligente y curiosa', example_translation: 'Она очень умная и любознательная девочка', pos: 'adjective', gender: null },
      { word: 'genial', translation: 'отличный / крутой / здорово', example: '¡Esa idea para el dibujo está genial!', example_translation: 'Эта идея для рисунка просто супер!', pos: 'adjective', gender: null },
      { word: 'la sorpresa', translation: 'сюрприз', example: 'Le preparamos una linda sorpresa de cumple', example_translation: 'Мы приготовили ей приятный сюрприз на день рождения', pos: 'noun', gender: 'f' }
    ]
  },

  // ---------------- PART 3: 10 New groups for Maya (5 words each = 50 words) ----------------
  {
    name: '📖 31. Книги и чтение',
    isActiveNow: false,
    words: [
      { word: 'leer', translation: 'читать', example: 'Me gusta leer cuentos antes de dormir', example_translation: 'Мне нравится читать сказки перед сном', pos: 'verb', gender: null, image_url: '/spanish/images/vocab/leer.jpg' },
      { word: 'el cuento', translation: 'сказка / рассказ', example: 'La abuela me contó un cuento hermoso', example_translation: 'Бабушка рассказала мне красивую сказку', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/cuento.jpg' },
      { word: 'la página', translation: 'страница', example: 'Abrí el libro en la página diez', example_translation: 'Открой книгу на десятой странице', pos: 'noun', gender: 'f', image_url: '/spanish/images/vocab/pagina.jpg' },
      { word: 'el dibujo', translation: 'рисунок', example: 'Hice un dibujo lleno de colores para mamá', example_translation: 'Я нарисовала рисунок, полный ярких цветов, для мамы', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/dibujo.jpg' },
      { word: 'la biblioteca', translation: 'библиотека', example: 'En la biblioteca de la escuela hay muchos libros', example_translation: 'В школьной библиотеке много книг', pos: 'noun', gender: 'f', image_url: '/spanish/images/vocab/biblioteca.jpg' }
    ]
  },
  {
    name: '🍳 32. Кухня и готовка',
    isActiveNow: false,
    words: [
      { word: 'cocinar', translation: 'готовить (еду)', example: 'Los domingos me gusta cocinar con papá', example_translation: 'По воскресеньям мне нравится готовить с папой', pos: 'verb', gender: null, image_url: '/spanish/images/vocab/cocinar.jpg' },
      { word: 'la cocina', translation: 'кухня', example: 'La cocina huele a galletitas recién horneadas', example_translation: 'На кухне пахнет свежеиспечённым печеньем', pos: 'noun', gender: 'f', image_url: '/spanish/images/vocab/cocina.jpg' },
      { word: 'la empanada', translation: 'эмпанада (пирожок)', example: 'Comimos empanadas caseras de queso', example_translation: 'Мы поели домашних эмпанад с сыром', pos: 'noun', gender: 'f', image_url: '/spanish/images/vocab/empanada.jpg' },
      { word: 'el plato', translation: 'тарелка / блюдо', example: 'Pongo el plato limpio sobre la mesa', example_translation: 'Я ставлю чистую тарелку на стол', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/plato.jpg' },
      { word: 'el vaso', translation: 'стакан', example: 'Tomé un vaso de agua fresca con hielo', example_translation: 'Я выпила стакан прохладной воды со льдом', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/vaso.jpg' }
    ]
  },
  {
    name: '🚌 33. Транспорт и город',
    isActiveNow: false,
    words: [
      { word: 'el colectivo', translation: 'автобус (в Аргентине)', example: 'Tomamos el colectivo para ir al centro', example_translation: 'Мы садимся на автобус, чтобы поехать в центр', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/colectivo.jpg' },
      { word: 'el tren', translation: 'поезд', example: 'El tren viaja rápido entre las estaciones', example_translation: 'Поезд едет быстро между станциями', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/tren.jpg' },
      { word: 'el avión', translation: 'самолёт', example: 'El avión vuela alto entre las nubes blancas', example_translation: 'Самолёт летит высоко среди белых облаков', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/avion.jpg' },
      { word: 'viajar', translation: 'путешествовать / ездить', example: 'En las vacaciones nos encanta viajar en familia', example_translation: 'На каникулах нам очень нравится путешествовать всей семьёй', pos: 'verb', gender: null, image_url: '/spanish/images/vocab/viajar.jpg' },
      { word: 'el mapa', translation: 'карта', example: 'Miramos el mapa para encontrar el camino al parque', example_translation: 'Мы смотрим на карту, чтобы найти дорогу в парк', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/mapa.jpg' }
    ]
  },
  {
    name: '🦋 34. Насекомые и птицы',
    isActiveNow: false,
    words: [
      { word: 'la mariposa', translation: 'бабочка', example: 'Una mariposa de colores brillantes vuela en el jardín', example_translation: 'Яркая разноцветная бабочка летает в саду', pos: 'noun', gender: 'f', image_url: '/spanish/images/vocab/mariposa.jpg' },
      { word: 'la abeja', translation: 'пчела', example: 'La abeja busca polen en las flores amarillas', example_translation: 'Пчела собирает пыльцу на жёлтых цветах', pos: 'noun', gender: 'f', image_url: '/spanish/images/vocab/abeja.jpg' },
      { word: 'la hormiga', translation: 'муравей', example: 'La hormiga camina muy rápido por la hoja', example_translation: 'Муравей очень быстро бежит по листку', pos: 'noun', gender: 'f', image_url: '/spanish/images/vocab/hormiga.jpg' },
      { word: 'el loro', translation: 'попугай', example: 'El loro verde habla y repite palabras graciosas', example_translation: 'Зелёный попугай говорит и повторяет забавные слова', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/loro.jpg' },
      { word: 'el pingüino', translation: 'пингвин', example: 'Los pingüinos nadan felices en el sur argentino', example_translation: 'Пингвины весело плавают на юге Аргентины', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/pinguino.jpg' }
    ]
  },
  {
    name: '🦁 35. Дикие животные',
    isActiveNow: false,
    words: [
      { word: 'el león', translation: 'лев', example: 'El león tiene una melena dorada y majestuosa', example_translation: 'У льва величественная золотистая грива', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/leon.jpg' },
      { word: 'el elefante', translation: 'слон', example: 'El elefante camina tranquilo con sus orejas grandes', example_translation: 'Слон спокойно идёт, шевеля большими ушами', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/elefante.jpg' },
      { word: 'el mono', translation: 'обезьяна', example: 'El mono salta de rama en rama en la selva', example_translation: 'Обезьяна прыгает с ветки на ветку в джунглях', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/mono.jpg' },
      { word: 'el oso', translation: 'медведь', example: 'El oso marrón duerme cerca del río de la montaña', example_translation: 'Бурый медведь спит у горной реки', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/oso.jpg' },
      { word: 'la jirafa', translation: 'жираф', example: 'La jirafa alta come hojas de la copa de los árboles', example_translation: 'Высокий жираф ест листья с верхушек деревьев', pos: 'noun', gender: 'f', image_url: '/spanish/images/vocab/jirafa.jpg' }
    ]
  },
  {
    name: '🌦️ 36. Погода и небо',
    isActiveNow: false,
    words: [
      { word: 'el cielo', translation: 'небо', example: 'El cielo de la tarde está completamente azul', example_translation: 'Дневное небо совершенно голубое', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/cielo.jpg' },
      { word: 'la nube', translation: 'облако', example: 'Una nube blanca suave parece un copo de algodón', example_translation: 'Белое пушистое облако похоже на комочек ваты', pos: 'noun', gender: 'f', image_url: '/spanish/images/vocab/nube.jpg' },
      { word: 'el viento', translation: 'ветер', example: 'El viento fresco mueve las hojas de la plaza', example_translation: 'Свежий ветер колышет листья в сквере', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/viento.jpg' },
      { word: 'el arcoíris', translation: 'радуга', example: 'Después de la lluvia salió un arcoíris brillante', example_translation: 'После дождя появилась яркая радуга', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/arcoiris.jpg' },
      { word: 'la nieve', translation: 'снег', example: 'La nieve blanca cubre los pinos en invierno', example_translation: 'Белый снег укрывает сосны зимой', pos: 'noun', gender: 'f', image_url: '/spanish/images/vocab/nieve.jpg' }
    ]
  },
  {
    name: '🏡 37. Уют дома и сад',
    isActiveNow: false,
    words: [
      { word: 'el jardín', translation: 'сад', example: 'En nuestro jardín florecen rosas perfumadas', example_translation: 'В нашем саду цветут ароматные розы', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/jardin.jpg' },
      { word: 'el sillón', translation: 'диван / кресло', example: 'Me siento cómoda en el sillón a leer un rato', example_translation: 'Я уютно устроилась в кресле немного почитать', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/sillon.jpg' },
      { word: 'la lámpara', translation: 'лампа / светильник', example: 'Prendí la lámpara del escritorio para dibujar', example_translation: 'Я зажгла настольную лампу, чтобы рисовать', pos: 'noun', gender: 'f', image_url: '/spanish/images/vocab/lampara.jpg' },
      { word: 'la planta', translation: 'растение', example: 'Riego mi planta verde todas las mañanas', example_translation: 'Я поливаю своё зелёное растение каждое утро', pos: 'noun', gender: 'f', image_url: '/spanish/images/vocab/planta.jpg' },
      { word: 'la llave', translation: 'ключ', example: 'Guardo la llave de casa en mi mochila escolar', example_translation: 'Я храню ключ от дома в своём школьном рюкзаке', pos: 'noun', gender: 'f', image_url: '/spanish/images/vocab/llave.jpg' }
    ]
  },
  {
    name: '🧼 38. Утро и гигиена',
    isActiveNow: false,
    words: [
      { word: 'lavar', translation: 'мыть / умывать', example: 'Hay que lavarse bien las manos antes de almorzar', example_translation: 'Нужно хорошо мыть руки перед обедом', pos: 'verb', gender: null, image_url: '/spanish/images/vocab/lavar.jpg' },
      { word: 'el jabón', translation: 'мыло', example: 'El jabón hace espuma suave y huele muy rico', example_translation: 'Мыло даёт мягкую пену и очень вкусно пахнет', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/jabon.jpg' },
      { word: 'el cepillo', translation: 'зубная щётка / щётка', example: 'Me cepillo los dientes con mi cepillo nuevo', example_translation: 'Я чищу зубы своей новой щёткой', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/cepillo.jpg' },
      { word: 'la toalla', translation: 'полотенце', example: 'Me seco las manos con una toalla suave y limpia', example_translation: 'Я вытираю руки мягким чистым полотенцем', pos: 'noun', gender: 'f', image_url: '/spanish/images/vocab/toalla.jpg' },
      { word: 'la ducha', translation: 'душ', example: 'Me doy una ducha tibia y refrescante por la mañana', example_translation: 'Я принимаю тёплый освежающий душ по утрам', pos: 'noun', gender: 'f', image_url: '/spanish/images/vocab/ducha.jpg' }
    ]
  },
  {
    name: '🎸 39. Музыкальные инструменты и творчество',
    isActiveNow: false,
    words: [
      { word: 'la guitarra', translation: 'гитара', example: 'Toco canciones lindas con la guitarra criolla', example_translation: 'Я играю красивые песни на гитаре', pos: 'noun', gender: 'f', image_url: '/spanish/images/vocab/guitarra.jpg' },
      { word: 'el piano', translation: 'пианино / фортепиано', example: 'Las teclas del piano suenan suaves y melodiosas', example_translation: 'Клавиши пианино звучат нежно и мелодично', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/piano.jpg' },
      { word: 'la radio', translation: 'радио', example: 'Ponemos la radio para escuchar música alegre', example_translation: 'Мы включаем радио, чтобы послушать весёлую музыку', pos: 'noun', gender: 'f', image_url: '/spanish/images/vocab/radio.jpg' },
      { word: 'el teatro', translation: 'театр', example: 'Fuimos al teatro a ver una obra divertida', example_translation: 'Мы ходили в театр посмотреть весёлый спектакль', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/teatro.jpg' },
      { word: 'la fiesta', translation: 'праздник / вечеринка', example: 'Preparamos una fiesta hermosa con globos y música', example_translation: 'Мы приготовили чудесный праздник с шариками и музыкой', pos: 'noun', gender: 'f', image_url: '/spanish/images/vocab/fiesta.jpg' }
    ]
  },
  {
    name: '🎁 40. Праздник и чувства',
    isActiveNow: false,
    words: [
      { word: 'el regalo', translation: 'подарок', example: 'Abrí un regalo sorpresa con una cinta dorada', example_translation: 'Я открыла подарок-сюрприз с золотой ленточкой', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/regalo.jpg' },
      { word: 'alegre', translation: 'радостный / весёлый', example: 'Maya está muy alegre jugando con sus amigas', example_translation: 'Майя очень радостная, когда играет с подругами', pos: 'adjective', gender: null, image_url: '/spanish/images/vocab/alegre.jpg' },
      { word: 'hablar', translation: 'говорить / разговаривать', example: 'Nos gusta hablar y reírnos en el recreo', example_translation: 'Нам нравится разговаривать и смеяться на перемене', pos: 'verb', gender: null, image_url: '/spanish/images/vocab/hablar.jpg' },
      { word: 'pensar', translation: 'думать', example: 'Me detengo a pensar antes de responder la pregunta', example_translation: 'Я останавливаюсь подумать, прежде чем ответить на вопрос', pos: 'verb', gender: null, image_url: '/spanish/images/vocab/pensar.jpg' },
      { word: 'el cumpleaños', translation: 'день рождения', example: '¡Celebramos mi cumpleaños con una torta deliciosa!', example_translation: 'Мы празднуем мой день рождения с вкусным тортом!', pos: 'noun', gender: 'm', image_url: '/spanish/images/vocab/cumpleanos.jpg' }
    ]
  },
  // ---------------- PART 4: 30 Expanded core groups for Maya (256 words) ----------------
  {
    name: "👤 41. Личные местоимения",
    isActiveNow: false,
    words: [
      {"word": "yo", "translation": "я", "example": "Yo soy Maya y estudio español.", "example_translation": "Я Майя и я учу испанский.", "pos": "pronoun", "gender": null},
      {"word": "tú", "translation": "ты", "example": "¿Tú querés venir a jugar?", "example_translation": "Ты хочешь пойти поиграть?", "pos": "pronoun", "gender": null},
      {"word": "él", "translation": "он", "example": "Él es mi hermano mayor.", "example_translation": "Он мой старший брат.", "pos": "pronoun", "gender": "m"},
      {"word": "ella", "translation": "она", "example": "Ella dibuja muy lindo.", "example_translation": "Она очень красиво рисует.", "pos": "pronoun", "gender": "f"},
      {"word": "usted", "translation": "Вы (вежливо)", "example": "¿Usted cómo se llama, señor?", "example_translation": "Как Вас зовут, сеньор?", "pos": "pronoun", "gender": null},
      {"word": "nosotros", "translation": "мы", "example": "Nosotros vamos juntos a la plaza.", "example_translation": "Мы идём вместе в парк.", "pos": "pronoun", "gender": "m"},
      {"word": "vosotros", "translation": "вы (мн. число в Испании)", "example": "Vosotros sois muy amables.", "example_translation": "Вы очень любезны.", "pos": "pronoun", "gender": "m"},
      {"word": "ellos", "translation": "они (муж. / смеш.)", "example": "Ellos juegan a la pelota en el patio.", "example_translation": "Они играют в мяч во дворе.", "pos": "pronoun", "gender": "m"},
      {"word": "ellas", "translation": "они (жен.)", "example": "Ellas cantan una canción hermosa.", "example_translation": "Они поют красивую песню.", "pos": "pronoun", "gender": "f"},
      {"word": "ustedes", "translation": "вы (мн. число)", "example": "¿Ustedes tienen la tarea lista?", "example_translation": "У вас готово домашнее задание?", "pos": "pronoun", "gender": null}
    ]
  },
  {
    name: "👉 42. Местоимения и указатели",
    isActiveNow: false,
    words: [
      {"word": "me", "translation": "меня / мне", "example": "Mamá me ayuda con el dibujo.", "example_translation": "Мама помогает мне с рисунком.", "pos": "pronoun", "gender": null},
      {"word": "te", "translation": "тебя / тебе", "example": "Te presto mi lápiz de color.", "example_translation": "Я одолжу тебе свой цветной карандаш.", "pos": "pronoun", "gender": null},
      {"word": "se", "translation": "себя / себе", "example": "Mateo se levanta temprano para ir a la escuela.", "example_translation": "Матео встаёт рано, чтобы пойти в школу.", "pos": "pronoun", "gender": null},
      {"word": "nos", "translation": "нас / нам", "example": "La seño nos lee un cuento divertido.", "example_translation": "Учительница читает нам забавную сказку.", "pos": "pronoun", "gender": null},
      {"word": "mi", "translation": "мой / моя", "example": "Esta es mi mochila favorita.", "example_translation": "Это мой любимый рюкзак.", "pos": "adjective", "gender": null},
      {"word": "tu", "translation": "твой / твоя", "example": "¿Dónde está tu cuaderno?", "example_translation": "Где твоя тетрадь?", "pos": "adjective", "gender": null},
      {"word": "su", "translation": "его / её / их / Ваш", "example": "Su perrito es blanco y juguetón.", "example_translation": "Её щенок белый и игривый.", "pos": "adjective", "gender": null},
      {"word": "este", "translation": "этот", "example": "Este libro tiene historias muy lindas.", "example_translation": "В этой книге очень хорошие рассказы.", "pos": "pronoun", "gender": "m"},
      {"word": "ese", "translation": "тот", "example": "Ese gatito duerme sobre la silla.", "example_translation": "Тот котёнок спит на стуле.", "pos": "pronoun", "gender": "m"},
      {"word": "aquel", "translation": "вон тот (далёкий)", "example": "Aquel árbol grande da mucha sombra.", "example_translation": "Вон то большое дерево даёт много тени.", "pos": "pronoun", "gender": "m"}
    ]
  },
  {
    name: "❓ 43. Неопределённые местоимения",
    isActiveNow: false,
    words: [
      {"word": "alguien", "translation": "кто-то / кто-нибудь", "example": "¿Alguien golpeó la puerta?", "example_translation": "Кто-то постучал в дверь?", "pos": "pronoun", "gender": null},
      {"word": "nadie", "translation": "никто", "example": "No hay nadie en el aula durante el recreo.", "example_translation": "Во время перемены в классе никого нет.", "pos": "pronoun", "gender": null},
      {"word": "algo", "translation": "что-то / что-нибудь", "example": "¿Querés comer algo rico?", "example_translation": "Хочешь съесть что-нибудь вкусное?", "pos": "pronoun", "gender": null},
      {"word": "nada", "translation": "ничего", "example": "No me falta nada para la clase.", "example_translation": "Мне ничего не не хватает к уроку.", "pos": "pronoun", "gender": null},
      {"word": "todo", "translation": "всё / весь", "example": "Terminé todo el ejercicio de matemática.", "example_translation": "Я закончила всё упражнение по математике.", "pos": "pronoun", "gender": "m"},
      {"word": "cada", "translation": "каждый / каждая", "example": "Cada mañana desayuno leche caliente.", "example_translation": "Каждое утро я завтракаю тёплым молоком.", "pos": "determiner", "gender": null},
      {"word": "otro", "translation": "другой", "example": "Quiero probar otro sabor de helado.", "example_translation": "Я хочу попробовать другой вкус мороженого.", "pos": "pronoun", "gender": "m"},
      {"word": "mismo", "translation": "тот же самый / сам", "example": "Llevamos el mismo uniforme a la escuela.", "example_translation": "Мы носим одинаковую школьную форму.", "pos": "adjective", "gender": "m"}
    ]
  },
  {
    name: "👥 44. Люди и окружение",
    isActiveNow: false,
    words: [
      {"word": "persona", "translation": "человек / персона", "example": "La abuela es una persona muy cariñosa.", "example_translation": "Бабушка — очень добрый и заботливый человек.", "pos": "noun", "gender": "f"},
      {"word": "hombre", "translation": "мужчина", "example": "Ese hombre amable ayuda a cruzar la calle.", "example_translation": "Этот вежливый мужчина помогает перейти улицу.", "pos": "noun", "gender": "m"},
      {"word": "mujer", "translation": "женщина", "example": "La doctora es una mujer muy sabia.", "example_translation": "Врач — очень мудрая женщина.", "pos": "noun", "gender": "f"},
      {"word": "niño", "translation": "ребёнок / мальчик", "example": "El niño juega contento con sus autitos.", "example_translation": "Мальчик радостно играет со своими машинками.", "pos": "noun", "gender": "m"},
      {"word": "familia", "translation": "семья", "example": "Los domingos almorzamos en familia.", "example_translation": "По воскресеньям мы обедаем всей семьёй.", "pos": "noun", "gender": "f"},
      {"word": "gente", "translation": "люди", "example": "Hay mucha gente alegre en la fiesta.", "example_translation": "На празднике много весёлых людей.", "pos": "noun", "gender": "f"}
    ]
  },
  {
    name: "⚡ 45. Главные глаголы",
    isActiveNow: false,
    words: [
      {"word": "ser", "translation": "быть / являться", "example": "Es importante ser amable con todos.", "example_translation": "Важно быть добрым со всеми.", "pos": "verb", "gender": null},
      {"word": "estar", "translation": "находиться / чувствовать себя", "example": "Estoy muy contenta con mi dibujo.", "example_translation": "Я очень довольна своим рисунком.", "pos": "verb", "gender": null},
      {"word": "tener", "translation": "иметь / обладать", "example": "Tengo que ordenar mi cuarto hoy.", "example_translation": "Мне нужно убрать в своей комнате сегодня.", "pos": "verb", "gender": null},
      {"word": "hacer", "translation": "делать", "example": "Vamos a hacer una torta de chocolate.", "example_translation": "Мы собираемся сделать шоколадный торт.", "pos": "verb", "gender": null},
      {"word": "ir", "translation": "идти / ехать", "example": "Voy a la escuela en colectivo.", "example_translation": "Я еду в школу на автобусе.", "pos": "verb", "gender": null},
      {"word": "venir", "translation": "приходить / приезжать", "example": "¿Querés venir a mi casa a jugar?", "example_translation": "Хочешь прийти ко мне домой поиграть?", "pos": "verb", "gender": null}
    ]
  },
  {
    name: "🧠 46. Глаголы мышления и знания",
    isActiveNow: false,
    words: [
      {"word": "querer", "translation": "хотеть / любить", "example": "Quiero aprender muchas palabras nuevas.", "example_translation": "Я хочу выучить много новых слов.", "pos": "verb", "gender": null},
      {"word": "poder", "translation": "мочь / уметь", "example": "Puedo dibujar una mariposa muy linda.", "example_translation": "Я могу нарисовать очень красивую бабочку.", "pos": "verb", "gender": null},
      {"word": "saber", "translation": "знать / уметь", "example": "Ya sé contar hasta cien en español.", "example_translation": "Я уже умею считать до ста по-испански.", "pos": "verb", "gender": null},
      {"word": "conocer", "translation": "знать / быть знакомым", "example": "Quiero conocer la ciudad de Córdoba.", "example_translation": "Я хочу познакомиться с городом Кордова.", "pos": "verb", "gender": null},
      {"word": "decir", "translation": "сказать / говорить", "example": "Siempre hay que decir la verdad.", "example_translation": "Всегда нужно говорить правду.", "pos": "verb", "gender": null},
      {"word": "ver", "translation": "видеть", "example": "Desde mi ventana puedo ver las flores del jardín.", "example_translation": "Из моего окна я вижу цветы в саду.", "pos": "verb", "gender": null},
      {"word": "oír", "translation": "слышать", "example": "¿Podés oír el canto de los pájaros?", "example_translation": "Ты слышишь пение птиц?", "pos": "verb", "gender": null},
      {"word": "creer", "translation": "верить / думать", "example": "Creo que mañana va a salir el sol.", "example_translation": "Я думаю, что завтра будет солнце.", "pos": "verb", "gender": null}
    ]
  },
  {
    name: "🏃 47. Глаголы движения и действий",
    isActiveNow: false,
    words: [
      {"word": "trabajar", "translation": "работать", "example": "Papá trabaja con su computadora.", "example_translation": "Папа работает за своим компьютером.", "pos": "verb", "gender": null},
      {"word": "estudiar", "translation": "учиться / изучать", "example": "Me gusta estudiar español todos los días.", "example_translation": "Мне нравится учить испанский каждый день.", "pos": "verb", "gender": null},
      {"word": "encontrar", "translation": "находить", "example": "Pude encontrar mi cartuchera debajo de la cama.", "example_translation": "Я смогла найти свой пенал под кроватью.", "pos": "verb", "gender": null},
      {"word": "dar", "translation": "давать", "example": "Me gusta dar abrazos a mis papás.", "example_translation": "Мне нравится обнимать родителей.", "pos": "verb", "gender": null},
      {"word": "poner", "translation": "класть / ставить", "example": "Pongo los platos limpios en la mesa.", "example_translation": "Я ставлю чистые тарелки на стол.", "pos": "verb", "gender": null},
      {"word": "llevar", "translation": "носить / уносить", "example": "Llevo mi mochila violeta a la escuela.", "example_translation": "Я ношу свой фиолетовый рюкзак в школу.", "pos": "verb", "gender": null},
      {"word": "traer", "translation": "приносить / привозить", "example": "¿Podés traer un vaso de agua fresca?", "example_translation": "Можешь принести стакан прохладной воды?", "pos": "verb", "gender": null},
      {"word": "dejar", "translation": "оставлять / позволять", "example": "Dejo mis zapatillas cerca de la puerta.", "example_translation": "Я оставляю свои кроссовки у двери.", "pos": "verb", "gender": null}
    ]
  },
  {
    name: "🚪 48. Глаголы перемещения и чувств",
    isActiveNow: false,
    words: [
      {"word": "pasar", "translation": "проходить / проводить время", "example": "Nos gusta pasar la tarde en la plaza.", "example_translation": "Нам нравится проводить день в парке.", "pos": "verb", "gender": null},
      {"word": "entrar", "translation": "входить", "example": "Vamos a entrar al aula cuando toque el timbre.", "example_translation": "Мы войдём в класс, когда прозвенит звонок.", "pos": "verb", "gender": null},
      {"word": "volver", "translation": "возвращаться", "example": "A las cinco volvemos a casa de la escuela.", "example_translation": "В пять мы возвращаемся домой из школы.", "pos": "verb", "gender": null},
      {"word": "necesitar", "translation": "нуждаться / быть нужным", "example": "Necesito una goma para borrar este dibujo.", "example_translation": "Мне нужен ластик, чтобы стереть этот рисунок.", "pos": "verb", "gender": null},
      {"word": "gustar", "translation": "нравиться", "example": "Me gusta mucho cantar y bailar.", "example_translation": "Мне очень нравится петь и танцевать.", "pos": "verb", "gender": null},
      {"word": "amar", "translation": "любить", "example": "Amo a mi familia y a mis amigos.", "example_translation": "Я люблю свою семью и друзей.", "pos": "verb", "gender": null},
      {"word": "sentir", "translation": "чувствовать", "example": "Hoy me siento con mucha energía para jugar.", "example_translation": "Сегодня я чувствую в себе много сил для игр.", "pos": "verb", "gender": null},
      {"word": "elegir", "translation": "выбирать", "example": "Puedo elegir el color que más me guste.", "example_translation": "Я могу выбрать цвет, который мне больше нравится.", "pos": "verb", "gender": null}
    ]
  },
  {
    name: "🛒 49. Глаголы в делах и общении",
    isActiveNow: false,
    words: [
      {"word": "pagar", "translation": "платить", "example": "Voy a pagar el alfajor en el quiosco.", "example_translation": "Я заплачу за альфахор в киоске.", "pos": "verb", "gender": null},
      {"word": "vender", "translation": "продавать", "example": "En esa tienda venden flores hermosas.", "example_translation": "В том магазине продают красивые цветы.", "pos": "verb", "gender": null},
      {"word": "usar", "translation": "использовать", "example": "Uso lápices de colores para pintar.", "example_translation": "Я использую цветные карандаши для раскрашивания.", "pos": "verb", "gender": null},
      {"word": "llamar", "translation": "звать / звонить", "example": "Mamá me llama para cenar.", "example_translation": "Мама зовёт меня ужинать.", "pos": "verb", "gender": null},
      {"word": "preguntar", "translation": "спрашивать", "example": "Levanto la mano para preguntar a la seño.", "example_translation": "Я поднимаю руку, чтобы спросить учительницу.", "pos": "verb", "gender": null},
      {"word": "responder", "translation": "отвечать", "example": "Sé responder todas las preguntas de la clase.", "example_translation": "Я умею отвечать на все вопросы урока.", "pos": "verb", "gender": null},
      {"word": "empezar", "translation": "начинать", "example": "La clase va a empezar en cinco minutos.", "example_translation": "Урок начнётся через пять минут.", "pos": "verb", "gender": null},
      {"word": "terminar", "translation": "заканчивать", "example": "Terminé de leer este cuento divertido.", "example_translation": "Я закончила читать эту забавную сказку.", "pos": "verb", "gender": null}
    ]
  },
  {
    name: "💭 50. Действия и восприятие",
    isActiveNow: false,
    words: [
      {"word": "recordar", "translation": "помнить / вспоминать", "example": "Recuerdo todas las canciones de la escuela.", "example_translation": "Я помню все школьные песенки.", "pos": "verb", "gender": null},
      {"word": "olvidar", "translation": "забывать", "example": "No me voy a olvidar de llevar la cartuchera.", "example_translation": "Я не забуду взять пенал.", "pos": "verb", "gender": null},
      {"word": "tomar", "translation": "пить / брать", "example": "Tomo un vaso de leche con galletitas.", "example_translation": "Я пью стакан молока с печеньем.", "pos": "verb", "gender": null},
      {"word": "beber", "translation": "пить", "example": "Es importante beber mucha agua en verano.", "example_translation": "Летом важно пить много воды.", "pos": "verb", "gender": null},
      {"word": "también", "translation": "также / тоже", "example": "A mí también me gusta el helado de chocolate.", "example_translation": "Мне тоже нравится шоколадное мороженое.", "pos": "adverb", "gender": null},
      {"word": "tampoco", "translation": "тоже не", "example": "Yo tampoco tengo frío hoy.", "example_translation": "Мне сегодня тоже не холодно.", "pos": "adverb", "gender": null},
      {"word": "claro", "translation": "конечно / ясно", "example": "¡Claro que sí, vamos a jugar!", "example_translation": "Конечно да, пойдём играть!", "pos": "adverb", "gender": null}
    ]
  },
  {
    name: "⏳ 51. Время и частота",
    isActiveNow: false,
    words: [
      {"word": "siempre", "translation": "всегда", "example": "Siempre saludo con una sonrisa.", "example_translation": "Я всегда здороваюсь с улыбкой.", "pos": "adverb", "gender": null},
      {"word": "nunca", "translation": "никогда", "example": "Nunca olvido guardar mis juguetes.", "example_translation": "Я никогда не забываю убирать свои игрушки.", "pos": "adverb", "gender": null},
      {"word": "ahora", "translation": "сейчас", "example": "Ahora vamos a merendar algo rico.", "example_translation": "Сейчас мы перекусим чем-нибудь вкусным.", "pos": "adverb", "gender": null},
      {"word": "antes", "translation": "до / раньше", "example": "Me lavo las manos antes de comer.", "example_translation": "Я мою руки перед едой.", "pos": "adverb", "gender": null},
      {"word": "después", "translation": "после / потом", "example": "Después de hacer la tarea voy a la plaza.", "example_translation": "После уроков я пойду в парк.", "pos": "adverb", "gender": null},
      {"word": "ayer", "translation": "вчера", "example": "Ayer jugamos un partido divertido.", "example_translation": "Вчера мы играли в весёлую игру.", "pos": "adverb", "gender": null},
      {"word": "temprano", "translation": "рано", "example": "Me despierto temprano los días de escuela.", "example_translation": "Я просыпаюсь рано в школьные дни.", "pos": "adverb", "gender": null},
      {"word": "pronto", "translation": "скоро", "example": "Pronto van a llegar las vacaciones.", "example_translation": "Скоро начнутся каникулы.", "pos": "adverb", "gender": null},
      {"word": "todavía", "translation": "всё ещё / пока", "example": "Todavía hay tiempo para jugar un rato más.", "example_translation": "Ещё есть время поиграть немного.", "pos": "adverb", "gender": null},
      {"word": "ya", "translation": "уже", "example": "¡Ya terminé todo mi dibujo!", "example_translation": "Я уже закончила весь свой рисунок!", "pos": "adverb", "gender": null}
    ]
  },
  {
    name: "📍 52. Местоположение и расстояние",
    isActiveNow: false,
    words: [
      {"word": "aquí", "translation": "здесь / тут", "example": "Aquí tengo mis témperas y pinceles.", "example_translation": "Здесь у меня гуашь и кисточки.", "pos": "adverb", "gender": null},
      {"word": "allí", "translation": "там", "example": "Allí en el árbol hay un nido de pájaros.", "example_translation": "Там на дереве птичье гнездо.", "pos": "adverb", "gender": null},
      {"word": "cerca", "translation": "близко / рядом", "example": "La escuela queda muy cerca de mi casa.", "example_translation": "Школа находится очень близко от моего дома.", "pos": "adverb", "gender": null},
      {"word": "lejos", "translation": "далеко", "example": "La playa queda lejos de la ciudad.", "example_translation": "Пляж находится далеко от города.", "pos": "adverb", "gender": null},
      {"word": "dentro", "translation": "внутри", "example": "Los lápices están dentro de la cartuchera.", "example_translation": "Карандаши лежат внутри пенала.", "pos": "adverb", "gender": null},
      {"word": "fuera", "translation": "снаружи", "example": "Jugamos fuera porque hace lindo día.", "example_translation": "Мы играем на улице, потому что хороший день.", "pos": "adverb", "gender": null},
      {"word": "arriba", "translation": "наверху / вверх", "example": "Mirá hacia arriba, hay nubes blancas.", "example_translation": "Посмотри наверх, там белые облака.", "pos": "adverb", "gender": null},
      {"word": "abajo", "translation": "внизу / вниз", "example": "La pelota rodó hacia abajo.", "example_translation": "Мяч покатился вниз.", "pos": "adverb", "gender": null}
    ]
  },
  {
    name: "⚖️ 53. Количество и степень",
    isActiveNow: false,
    words: [
      {"word": "mucho", "translation": "много", "example": "Tengo mucho entusiasmo por aprender.", "example_translation": "У меня много энтузиазма учиться.", "pos": "adverb", "gender": null},
      {"word": "poco", "translation": "мало / немного", "example": "Queda un poco de jugo en la jarra.", "example_translation": "В кувшине осталось немного сока.", "pos": "adverb", "gender": null},
      {"word": "más", "translation": "больше / более", "example": "¿Querés un poco más de ensalada?", "example_translation": "Хочешь ещё немного салата?", "pos": "adverb", "gender": null},
      {"word": "menos", "translation": "меньше / менее", "example": "Hoy hace menos calor que ayer.", "example_translation": "Сегодня менее жарко, чем вчера.", "pos": "adverb", "gender": null},
      {"word": "muy", "translation": "очень", "example": "Este alfajor está muy rico.", "example_translation": "Этот альфахор очень вкусный.", "pos": "adverb", "gender": null},
      {"word": "bastante", "translation": "достаточно / довольно", "example": "El libro es bastante interesante.", "example_translation": "Книга довольно интересная.", "pos": "adverb", "gender": null},
      {"word": "casi", "translation": "почти", "example": "Casi termino de armar el rompecabezas.", "example_translation": "Я почти закончила собирать пазл.", "pos": "adverb", "gender": null},
      {"word": "solamente", "translation": "только / лишь", "example": "Solamente me falta un ejercicio.", "example_translation": "Мне осталось сделать только одно упражнение.", "pos": "adverb", "gender": null},
      {"word": "quizá", "translation": "может быть / возможно", "example": "Quizá vayamos al parque el domingo.", "example_translation": "Может быть, мы пойдём в парк в воскресенье.", "pos": "adverb", "gender": null},
      {"word": "otra vez", "translation": "ещё раз / снова", "example": "¿Podés repetir otra vez, por favor?", "example_translation": "Можешь повторить ещё раз, пожалуйста?", "pos": "phrase", "gender": null}
    ]
  },
  {
    name: "🎯 54. Оценки и связь",
    isActiveNow: false,
    words: [
      {"word": "mal", "translation": "плохо", "example": "No te preocupes, no pasa nada si sale mal.", "example_translation": "Не переживай, ничего страшного, если получится плохо.", "pos": "adverb", "gender": null},
      {"word": "mejor", "translation": "лучше / лучший", "example": "Hoy me siento mucho mejor.", "example_translation": "Сегодня я чувствую себя намного лучше.", "pos": "adjective", "gender": null},
      {"word": "peor", "translation": "хуже / худший", "example": "Nada es peor que perder el tren.", "example_translation": "Ничего нет хуже, чем опоздать на поезд.", "pos": "adjective", "gender": null},
      {"word": "juntos", "translation": "вместе", "example": "Hacemos la tarea juntos.", "example_translation": "Мы делаем уроки вместе.", "pos": "adverb", "gender": null},
      {"word": "solo", "translation": "только / один", "example": "Mateo puede atar sus cordones solo.", "example_translation": "Матео умеет завязывать шнурки сам.", "pos": "adverb", "gender": null},
      {"word": "además", "translation": "кроме того", "example": "Es divertido y además aprendo mucho.", "example_translation": "Это весело и кроме того я многому учусь.", "pos": "conjunction", "gender": null}
    ]
  },
  {
    name: "❓ 55. Вопросительные слова",
    isActiveNow: false,
    words: [
      {"word": "qué", "translation": "что? / какой?", "example": "¿Qué libro estás leyendo ahora?", "example_translation": "Какую книгу ты сейчас читаешь?", "pos": "pronoun", "gender": null},
      {"word": "quién", "translation": "кто?", "example": "¿Quién quiere jugar a las escondidas?", "example_translation": "Кто хочет поиграть в прятки?", "pos": "pronoun", "gender": null},
      {"word": "cuándo", "translation": "когда?", "example": "¿Cuándo empieza el recreo?", "example_translation": "Когда начинается перемена?", "pos": "adverb", "gender": null},
      {"word": "dónde", "translation": "где?", "example": "¿Dónde dejaste tu lápiz?", "example_translation": "Где ты оставила свой карандаш?", "pos": "adverb", "gender": null},
      {"word": "adónde", "translation": "куда?", "example": "¿Adónde vamos de paseo el sábado?", "example_translation": "Куда мы пойдём гулять в субботу?", "pos": "adverb", "gender": null},
      {"word": "cómo", "translation": "как?", "example": "¿Cómo se dice esta palabra en español?", "example_translation": "Как говорится это слово по-испански?", "pos": "adverb", "gender": null},
      {"word": "cuánto", "translation": "сколько?", "example": "¿Cuánto tiempo falta para salir?", "example_translation": "Сколько времени осталось до выхода?", "pos": "determiner", "gender": "m"},
      {"word": "cuál", "translation": "какой? / который?", "example": "¿Cuál es tu color preferido?", "example_translation": "Какой твой любимый цвет?", "pos": "pronoun", "gender": null},
      {"word": "por qué", "translation": "почему?", "example": "¿Por qué las hojas caen en otoño?", "example_translation": "Почему листья опадают осенью?", "pos": "adverb", "gender": null}
    ]
  },
  {
    name: "🔗 56. Предлоги",
    isActiveNow: false,
    words: [
      {"word": "de", "translation": "из / от / о", "example": "El vaso es de vidrio limpio.", "example_translation": "Стакан из чистого стекла.", "pos": "preposition", "gender": null},
      {"word": "a", "translation": "к / в / на", "example": "Vamos a la biblioteca a leer.", "example_translation": "Мы идём в библиотеку читать.", "pos": "preposition", "gender": null},
      {"word": "en", "translation": "в / на", "example": "Los libros están en la mesa.", "example_translation": "Книги лежат на столе.", "pos": "preposition", "gender": null},
      {"word": "con", "translation": "с / вместе с", "example": "Juego con mis amigas en el patio.", "example_translation": "Я играю с подругами во дворе.", "pos": "preposition", "gender": null},
      {"word": "sin", "translation": "без", "example": "Tomo té sin azúcar.", "example_translation": "Я пью чай без сахара.", "pos": "preposition", "gender": null},
      {"word": "para", "translation": "для / чтобы", "example": "Este dibujo es para mi mamá.", "example_translation": "Этот рисунок для моей мамы.", "pos": "preposition", "gender": null},
      {"word": "por", "translation": "по / из-за / через", "example": "Paseamos por el parque verde.", "example_translation": "Мы гуляем по зелёному парку.", "pos": "preposition", "gender": null},
      {"word": "sobre", "translation": "на / о / над", "example": "Dejé la cartuchera sobre el escritorio.", "example_translation": "Я оставила пенал на письменном столе.", "pos": "preposition", "gender": null},
      {"word": "entre", "translation": "между / среди", "example": "La mariposa vuela entre las flores.", "example_translation": "Бабочка летает среди цветов.", "pos": "preposition", "gender": null},
      {"word": "hasta", "translation": "до", "example": "Caminamos juntos hasta la esquina.", "example_translation": "Мы идём вместе до угла.", "pos": "preposition", "gender": null},
      {"word": "desde", "translation": "от / с", "example": "Desde aquí puedo ver las montañas.", "example_translation": "Отсюда я вижу горы.", "pos": "preposition", "gender": null},
      {"word": "hacia", "translation": "по направлению к / в сторону", "example": "Caminamos hacia la plaza soleada.", "example_translation": "Мы идём в сторону солнечного парка.", "pos": "preposition", "gender": null},
      {"word": "contra", "translation": "против / о", "example": "Reboto la pelota contra la pared.", "example_translation": "Я бросаю мяч о стену.", "pos": "preposition", "gender": null}
    ]
  },
  {
    name: "🔗 57. Союзы и связки",
    isActiveNow: false,
    words: [
      {"word": "y", "translation": "и", "example": "Tengo lápices y cuadernos nuevos.", "example_translation": "У меня новые карандаши и тетради.", "pos": "conjunction", "gender": null},
      {"word": "o", "translation": "или", "example": "¿Querés manzana o banana?", "example_translation": "Хочешь яблоко или банан?", "pos": "conjunction", "gender": null},
      {"word": "pero", "translation": "но", "example": "Está nublado pero no llueve.", "example_translation": "Облачно, но дождь не идёт.", "pos": "conjunction", "gender": null},
      {"word": "aunque", "translation": "хотя", "example": "Salimos a jugar aunque hace un poco de frío.", "example_translation": "Мы выходим играть, хотя немного прохладно.", "pos": "conjunction", "gender": null},
      {"word": "si", "translation": "если", "example": "Si terminás la tarea, vamos a la plaza.", "example_translation": "Если закончишь уроки, пойдём в парк.", "pos": "conjunction", "gender": null},
      {"word": "porque", "translation": "потому что", "example": "Estoy feliz porque hoy es mi cumpleaños.", "example_translation": "Я счастлива, потому что сегодня мой день рождения.", "pos": "conjunction", "gender": null},
      {"word": "entonces", "translation": "тогда", "example": "Si llueve, entonces leemos un libro adentro.", "example_translation": "Если пойдёт дождь, тогда мы почитаем книгу дома.", "pos": "adverb", "gender": null},
      {"word": "así", "translation": "так / таким образом", "example": "Se dibuja así, paso a paso.", "example_translation": "Это рисуется вот так, шаг за шагом.", "pos": "adverb", "gender": null},
      {"word": "como", "translation": "как", "example": "Corre rápido como un gato.", "example_translation": "Он бегает быстро, как кошка.", "pos": "conjunction", "gender": null},
      {"word": "que", "translation": "что / который", "example": "El libro que me diste es muy divertido.", "example_translation": "Книга, которую ты мне дал, очень забавная.", "pos": "conjunction", "gender": null},
      {"word": "cuando", "translation": "когда", "example": "Me pongo contenta cuando vienen mis amigos.", "example_translation": "Я радуюсь, когда приходят мои друзья.", "pos": "conjunction", "gender": null},
      {"word": "mientras", "translation": "в то время как / пока", "example": "Escucho música mientras dibujo.", "example_translation": "Я слушаю музыку, пока рисую.", "pos": "conjunction", "gender": null}
    ]
  },
  {
    name: "✨ 58. Описания: характер и размер",
    isActiveNow: false,
    words: [
      {"word": "bueno", "translation": "хороший / добрый", "example": "Mateo es un chico muy bueno y amigable.", "example_translation": "Матео очень хороший и дружелюбный мальчик.", "pos": "adjective", "gender": "m"},
      {"word": "malo", "translation": "плохой", "example": "El lobo del cuento no era tan malo.", "example_translation": "Волк из сказки был не таким уж и плохим.", "pos": "adjective", "gender": "m"},
      {"word": "pequeño", "translation": "маленький", "example": "El pajarito pequeño aprende a volar.", "example_translation": "Маленькая птичка учится летать.", "pos": "adjective", "gender": "m"},
      {"word": "alto", "translation": "высокий", "example": "La jirafa es un animal muy alto.", "example_translation": "Жираф — очень высокое животное.", "pos": "adjective", "gender": "m"},
      {"word": "bajo", "translation": "низкий", "example": "El banquito es bajo y cómodo.", "example_translation": "Табуретка низкая и удобная.", "pos": "adjective", "gender": "m"},
      {"word": "largo", "translation": "длинный", "example": "El tren tiene un camino muy largo.", "example_translation": "У поезда очень длинный путь.", "pos": "adjective", "gender": "m"},
      {"word": "corto", "translation": "короткий", "example": "El recreo nos pareció muy corto.", "example_translation": "Перемена показалась нам очень короткой.", "pos": "adjective", "gender": "m"},
      {"word": "nuevo", "translation": "новый", "example": "Tengo un cuaderno nuevo para dibujar.", "example_translation": "У меня новая тетрадь для рисования.", "pos": "adjective", "gender": "m"},
      {"word": "viejo", "translation": "старый", "example": "Mi osito viejo de peluche es muy suave.", "example_translation": "Мой старый плюшевый мишка очень мягкий.", "pos": "adjective", "gender": "m"},
      {"word": "joven", "translation": "молодой", "example": "La profesora de música es muy joven y alegre.", "example_translation": "Учительница музыки очень молодая и весёлая.", "pos": "adjective", "gender": null}
    ]
  },
  {
    name: "🎨 59. Впечатления и оценки",
    isActiveNow: false,
    words: [
      {"word": "bonito", "translation": "красивый / симпатичный", "example": "Ese vestido con flores es muy bonito.", "example_translation": "Это платье с цветами очень красивое.", "pos": "adjective", "gender": "m"},
      {"word": "feo", "translation": "некрасивый", "example": "El dibujo no quedó feo, ¡quedó gracioso!", "example_translation": "Рисунок получился не некрасивым, он получился забавным!", "pos": "adjective", "gender": "m"},
      {"word": "fácil", "translation": "лёгкий / простой", "example": "Este ejercicio de palabras es muy fácil.", "example_translation": "Это упражнение со словами очень лёгкое.", "pos": "adjective", "gender": null},
      {"word": "difícil", "translation": "трудный / сложный", "example": "Al principio parecía difícil, pero lo logré.", "example_translation": "Вначале казалось сложным, но у меня получилось.", "pos": "adjective", "gender": null},
      {"word": "importante", "translation": "важный", "example": "Es importante lavarse los dientes todos los días.", "example_translation": "Важно чистить зубы каждый день.", "pos": "adjective", "gender": null},
      {"word": "diferente", "translation": "другой / различный", "example": "Cada flor del jardín tiene un color diferente.", "example_translation": "У каждого цветка в саду свой цвет.", "pos": "adjective", "gender": null},
      {"word": "igual", "translation": "одинаковый / равный", "example": "Los dos cuadernos son de igual tamaño.", "example_translation": "Обе тетради одинакового размера.", "pos": "adjective", "gender": null},
      {"word": "triste", "translation": "грустный", "example": "Si mi amiga está triste, le doy un abrazo.", "example_translation": "Если моя подруга грустная, я её обнимаю.", "pos": "adjective", "gender": null},
      {"word": "ocupado", "translation": "занятый", "example": "Papá está ocupado cocinando la cena.", "example_translation": "Папа занят приготовлением ужина.", "pos": "adjective", "gender": "m"},
      {"word": "libre", "translation": "свободный", "example": "En mi tiempo libre me gusta bailar.", "example_translation": "В свободное время мне нравится танцевать.", "pos": "adjective", "gender": null}
    ]
  },
  {
    name: "🌡️ 60. Свойства предметов",
    isActiveNow: false,
    words: [
      {"word": "lleno", "translation": "полный", "example": "El vaso está lleno de jugo de naranja.", "example_translation": "Стакан полон апельсинового сока.", "pos": "adjective", "gender": "m"},
      {"word": "vacío", "translation": "пустой", "example": "El plato quedó vacío después de la merienda.", "example_translation": "Тарелка осталась пустой после полдника.", "pos": "adjective", "gender": "m"},
      {"word": "caliente", "translation": "горячий", "example": "La sopa está rica y caliente.", "example_translation": "Суп вкусный и горячий.", "pos": "adjective", "gender": null},
      {"word": "limpio", "translation": "чистый", "example": "Mi cuarto quedó ordenado y limpio.", "example_translation": "Моя комната осталась прибранной и чистой.", "pos": "adjective", "gender": "m"},
      {"word": "sucio", "translation": "грязный", "example": "Lavé mis zapatillas porque estaban con barro.", "example_translation": "Я помыла свои кроссовки, потому что они были в грязи.", "pos": "adjective", "gender": "m"},
      {"word": "caro", "translation": "дорогой (по цене)", "example": "Ese juguete grande es muy caro.", "example_translation": "Та большая игрушка очень дорогая.", "pos": "adjective", "gender": "m"},
      {"word": "barato", "translation": "дешёвый / недорогой", "example": "Compré un alfajor rico y barato.", "example_translation": "Я купила вкусный и недорогой альфахор.", "pos": "adjective", "gender": "m"},
      {"word": "lento", "translation": "медленный", "example": "El caracol camina con paso lento.", "example_translation": "Улитка ползёт медленным шагом.", "pos": "adjective", "gender": "m"},
      {"word": "fuerte", "translation": "сильный", "example": "El viento sopló fuerte y movió los árboles.", "example_translation": "Ветер подул сильно и раскачал деревья.", "pos": "adjective", "gender": null},
      {"word": "débil", "translation": "слабый", "example": "La plantita pequeña todavía es débil y necesita sol.", "example_translation": "Маленькое растение ещё слабое и ему нужно солнце.", "pos": "adjective", "gender": null}
    ]
  },
  {
    name: "🛡️ 61. Качества и возможности",
    isActiveNow: false,
    words: [
      {"word": "amable", "translation": "любезный / приветливый", "example": "La vecina siempre es muy amable con nosotros.", "example_translation": "Соседка всегда очень приветлива с нами.", "pos": "adjective", "gender": null},
      {"word": "interesante", "translation": "интересный", "example": "La clase sobre dinosaurios fue muy interesante.", "example_translation": "Урок про динозавров был очень интересным.", "pos": "adjective", "gender": null},
      {"word": "seguro", "translation": "безопасный / уверенный", "example": "El patio de la escuela es un lugar seguro para jugar.", "example_translation": "Школьный двор — безопасное место для игр.", "pos": "adjective", "gender": "m"},
      {"word": "peligroso", "translation": "опасный", "example": "Cruzar la calle sin mirar es peligroso.", "example_translation": "Переходить улицу, не глядя по сторонам, опасно.", "pos": "adjective", "gender": "m"},
      {"word": "posible", "translation": "возможный", "example": "Con práctica todo es posible.", "example_translation": "С практикой всё возможно.", "pos": "adjective", "gender": null},
      {"word": "imposible", "translation": "невозможный", "example": "Nada es imposible si nos ayudamos entre todos.", "example_translation": "Ничего нет невозможного, если мы помогаем друг другу.", "pos": "adjective", "gender": null},
      {"word": "necesario", "translation": "необходимый", "example": "Es necesario dormir bien para crecer fuerte.", "example_translation": "Необходимо хорошо спать, чтобы расти сильной.", "pos": "adjective", "gender": "m"},
      {"word": "listo", "translation": "готовый / сообразительный", "example": "Mi mochila ya está lista para mañana.", "example_translation": "Мой рюкзак уже готов на завтра.", "pos": "adjective", "gender": "m"}
    ]
  },
  {
    name: "🍽️ 62. Приёмы пищи и продукты",
    isActiveNow: false,
    words: [
      {"word": "comida", "translation": "еда", "example": "La comida casera de mamá es riquísima.", "example_translation": "Домашняя мамина еда очень вкусная.", "pos": "noun", "gender": "f"},
      {"word": "desayuno", "translation": "завтрак", "example": "Para el desayuno me gusta una tostada con manteca.", "example_translation": "На завтрак мне нравится тост со сливочным маслом.", "pos": "noun", "gender": "m"},
      {"word": "almuerzo", "translation": "обед", "example": "En el almuerzo comemos fideos con queso.", "example_translation": "На обед мы едим макароны с сыром.", "pos": "noun", "gender": "m"},
      {"word": "cena", "translation": "ужин", "example": "Para la cena preparamos una tarta de verduras.", "example_translation": "На ужин мы готовим пирог с овощами.", "pos": "noun", "gender": "f"},
      {"word": "café", "translation": "кофе", "example": "Papá toma café caliente por la mañana.", "example_translation": "Папа пьёт горячий кофе по утрам.", "pos": "noun", "gender": "m"},
      {"word": "carne", "translation": "мясо", "example": "En Argentina el asado de carne es muy popular.", "example_translation": "В Аргентине мясное асадо очень популярно.", "pos": "noun", "gender": "f"},
      {"word": "pollo", "translation": "курица", "example": "Comimos pollo al horno con papas doradas.", "example_translation": "Мы поели запечённую курицу с золотистой картошкой.", "pos": "noun", "gender": "m"},
      {"word": "pescado", "translation": "рыба (блюдо)", "example": "El pescado con limón es sano y rico.", "example_translation": "Рыба с лимоном — полезная и вкусная.", "pos": "noun", "gender": "m"},
      {"word": "arroz", "translation": "рис", "example": "Mamá preparó un rico arroz con pollo.", "example_translation": "Мама приготовила вкусный рис с курицей.", "pos": "noun", "gender": "m"},
      {"word": "pasta", "translation": "макароны / паста", "example": "Los domingos comemos pasta casera en familia.", "example_translation": "По воскресеньям мы едим домашнюю пасту всей семьёй.", "pos": "noun", "gender": "f"}
    ]
  },
  {
    name: "🥗 63. Бакалея и напитки",
    isActiveNow: false,
    words: [
      {"word": "huevo", "translation": "яйцо", "example": "Usamos dos huevos para hacer la torta.", "example_translation": "Мы берём два яйца, чтобы испечь торт.", "pos": "noun", "gender": "m"},
      {"word": "verdura", "translation": "овощ / овощи", "example": "La ensalada tiene lechuga, tomate y verdura fresca.", "example_translation": "В салате листья салата, помидор и свежие овощи.", "pos": "noun", "gender": "f"},
      {"word": "naranja", "translation": "апельсин", "example": "Exprimí una naranja dulce para el desayuno.", "example_translation": "Я выжала сладкий апельсин к завтраку.", "pos": "noun", "gender": "f"},
      {"word": "azúcar", "translation": "сахар", "example": "Le pongo una cucharadita de azúcar al té.", "example_translation": "Я кладу ложечку сахара в чай.", "pos": "noun", "gender": "m"},
      {"word": "sal", "translation": "соль", "example": "Poné un poquito de sal en la ensalada.", "example_translation": "Положи немного соли в салат.", "pos": "noun", "gender": "f"},
      {"word": "aceite", "translation": "масло (растительное)", "example": "Condimentamos los tomates con aceite de oliva.", "example_translation": "Мы заправляем помидоры оливковым маслом.", "pos": "noun", "gender": "m"},
      {"word": "cerveza", "translation": "пиво", "example": "Los adultos brindaron con una cerveza fresca.", "example_translation": "Взрослые чокнулись прохладным пивом.", "pos": "noun", "gender": "f"},
      {"word": "vino", "translation": "вино", "example": "Los grandes tomaron una copa de vino en la cena.", "example_translation": "Взрослые выпили бокал вина за ужином.", "pos": "noun", "gender": "m"},
      {"word": "cuenta", "translation": "счёт", "example": "Papá pidió la cuenta al mozo en el restaurante.", "example_translation": "Папа попросил счёт у официанта в ресторане.", "pos": "noun", "gender": "f"}
    ]
  },
  {
    name: "🏙️ 64. Городские места",
    isActiveNow: false,
    words: [
      {"word": "pueblo", "translation": "посёлок / деревня / городок", "example": "En las vacaciones visitamos un pueblo tranquilo.", "example_translation": "На каникулах мы посетили тихий городок.", "pos": "noun", "gender": "m"},
      {"word": "país", "translation": "страна", "example": "Argentina es un país muy hermoso y grande.", "example_translation": "Аргентина — очень красивая и большая страна.", "pos": "noun", "gender": "m"},
      {"word": "lugar", "translation": "место", "example": "La plaza es mi lugar preferido para jugar.", "example_translation": "Парк — моё любимое место для игр.", "pos": "noun", "gender": "m"},
      {"word": "supermercado", "translation": "супермаркет", "example": "Acompaño a mamá a hacer las compras al supermercado.", "example_translation": "Я иду с мамой за покупками в супермаркет.", "pos": "noun", "gender": "m"},
      {"word": "restaurante", "translation": "ресторан", "example": "Fuimos a un restaurante italiano a comer pizza.", "example_translation": "Мы пошли в итальянский ресторан поесть пиццы.", "pos": "noun", "gender": "m"},
      {"word": "hotel", "translation": "отель / гостиница", "example": "Nos quedamos en un hotel lindo cerca del mar.", "example_translation": "Мы остановились в хорошем отеле рядом с морем.", "pos": "noun", "gender": "m"},
      {"word": "hospital", "translation": "больница", "example": "El hospital tiene médicos amables que curan a los niños.", "example_translation": "В больнице добрые врачи, которые лечат детей.", "pos": "noun", "gender": "m"},
      {"word": "escuela", "translation": "школа", "example": "Mi escuela tiene un patio grande con árboles.", "example_translation": "В моей школе большой двор с деревьями.", "pos": "noun", "gender": "f"}
    ]
  },
  {
    name: "🚗 65. Работа, деньги и транспорт",
    isActiveNow: false,
    words: [
      {"word": "trabajo", "translation": "работа", "example": "Mamá vuelve contenta de su trabajo.", "example_translation": "Мама возвращается довольная с работы.", "pos": "noun", "gender": "m"},
      {"word": "dinero", "translation": "деньги", "example": "Ahorro mi dinero en una alcancía con forma de chanchito.", "example_translation": "Я коплю свои деньги в копилке-свинке.", "pos": "noun", "gender": "m"},
      {"word": "precio", "translation": "цена", "example": "El libro tiene un precio muy accesible.", "example_translation": "У книги очень доступная цена.", "pos": "noun", "gender": "m"},
      {"word": "coche", "translation": "машина / автомобиль", "example": "El coche viaja por la ruta hacia la costa.", "example_translation": "Машина едет по трассе к побережью.", "pos": "noun", "gender": "m"},
      {"word": "autobús", "translation": "автобус", "example": "El autobús escolar nos pasa a buscar por la mañana.", "example_translation": "Школьный автобус заезжает за нами по утрам.", "pos": "noun", "gender": "m"},
      {"word": "taxi", "translation": "такси", "example": "Tomamos un taxi amarillo y negro para llegar rápido.", "example_translation": "Мы взяли жёлто-чёрное такси, чтобы добраться быстрее.", "pos": "noun", "gender": "m"},
      {"word": "camino", "translation": "дорога / путь", "example": "El camino al parque está lleno de flores.", "example_translation": "Дорога в парк полна цветов.", "pos": "noun", "gender": "m"},
      {"word": "tiempo", "translation": "время / погода", "example": "Hoy hace un tiempo hermoso y soleado.", "example_translation": "Сегодня прекрасная и солнечная погода.", "pos": "noun", "gender": "m"}
    ]
  },
  {
    name: "🧭 66. Направления и ориентиры",
    isActiveNow: false,
    words: [
      {"word": "izquierda", "translation": "лево / слева", "example": "Doblá a la izquierda en la esquina de la plaza.", "example_translation": "Поверни налево на углу парка.", "pos": "noun", "gender": "f"},
      {"word": "derecha", "translation": "право / справа", "example": "La biblioteca queda a la derecha de la entrada.", "example_translation": "Библиотека находится справа от входа.", "pos": "noun", "gender": "f"},
      {"word": "entrada", "translation": "вход", "example": "Nos encontramos en la entrada de la escuela.", "example_translation": "Мы встретимся у входа в школу.", "pos": "noun", "gender": "f"},
      {"word": "salida", "translation": "выход", "example": "La salida del cine está bien iluminada.", "example_translation": "Выход из кинотеатра хорошо освещён.", "pos": "noun", "gender": "f"}
    ]
  },
  {
    name: "📅 67. Время и природа",
    isActiveNow: false,
    words: [
      {"word": "mes", "translation": "месяц", "example": "El mes de octubre tiene días muy primaverales.", "example_translation": "В октябре очень весенние дни.", "pos": "noun", "gender": "m"},
      {"word": "año", "translation": "год", "example": "Este año aprendí muchas cosas en la escuela.", "example_translation": "В этом году я узнала много нового в школе.", "pos": "noun", "gender": "m"},
      {"word": "minuto", "translation": "минута", "example": "Falta solo un minuto para que toque el timbre.", "example_translation": "Осталась всего одна минута до звонка.", "pos": "noun", "gender": "m"},
      {"word": "montaña", "translation": "гора", "example": "En las vacaciones vimos montañas muy altas con nieve.", "example_translation": "На каникулах мы видели высокие горы со снегом.", "pos": "noun", "gender": "f"},
      {"word": "río", "translation": "река", "example": "El agua del río es fresca y cristalina.", "example_translation": "Вода в реке прохладная и прозрачная.", "pos": "noun", "gender": "m"},
      {"word": "tierra", "translation": "земля", "example": "Plantamos flores de colores en la tierra del jardín.", "example_translation": "Мы посадили цветные цветы в землю в саду.", "pos": "noun", "gender": "f"},
      {"word": "vida", "translation": "жизнь", "example": "La vida en familia es hermosa y alegre.", "example_translation": "Семейная жизнь прекрасна и радостна.", "pos": "noun", "gender": "f"}
    ]
  },
  {
    name: "💪 68. Тело и здоровье",
    isActiveNow: false,
    words: [
      {"word": "cuerpo", "translation": "тело", "example": "Bailar es bueno para cuidar el cuerpo y divertirse.", "example_translation": "Танцевать полезно для тела и весело.", "pos": "noun", "gender": "m"},
      {"word": "cara", "translation": "лицо", "example": "Me lavo la cara con agua fresca por la mañana.", "example_translation": "Я умываю лицо прохладной водой по утрам.", "pos": "noun", "gender": "f"},
      {"word": "brazo", "translation": "рука (от плеча)", "example": "Levanto el brazo para saludar a mi amiga.", "example_translation": "Я поднимаю руку, чтобы помахать подруге.", "pos": "noun", "gender": "m"},
      {"word": "pierna", "translation": "нога (вся)", "example": "Tengo piernas fuertes para correr y saltar.", "example_translation": "У меня сильные ноги, чтобы бегать и прыгать.", "pos": "noun", "gender": "f"},
      {"word": "pelo", "translation": "волосы", "example": "Mamá me peina el pelo largo con un cepillo suave.", "example_translation": "Мама расчёсывает мои длинные волосы мягкой щёткой.", "pos": "noun", "gender": "m"},
      {"word": "salud", "translation": "здоровье", "example": "Comer frutas y verduras es muy bueno para la salud.", "example_translation": "Есть фрукты и овощи очень полезно для здоровья.", "pos": "noun", "gender": "f"},
      {"word": "dolor", "translation": "боль", "example": "Ya no siento dolor en la rodilla.", "example_translation": "Я больше не чувствую боли в коленке.", "pos": "noun", "gender": "m"},
      {"word": "médico", "translation": "врач / доктор", "example": "El médico me revisó y me dijo que estoy muy sana.", "example_translation": "Врач осмотрел меня и сказал, что я абсолютно здорова.", "pos": "noun", "gender": "m"},
      {"word": "enfermedad", "translation": "болезнь", "example": "Dormir bien nos protege de cualquier enfermedad.", "example_translation": "Хороший сон защищает нас от любых болезней.", "pos": "noun", "gender": "f"}
    ]
  },
  {
    name: "👋 69. Вежливость и этикет",
    isActiveNow: false,
    words: [
      {"word": "adiós", "translation": "до свидания / прощай", "example": "¡Adiós, nos vemos el lunes en la escuela!", "example_translation": "До свидания, увидимся в понедельник в школе!", "pos": "interjection", "gender": null},
      {"word": "disculpa", "translation": "извини / извините", "example": "Disculpa, no te escuché bien.", "example_translation": "Извини, я тебя плохо услышала.", "pos": "interjection", "gender": null},
      {"word": "permiso", "translation": "разрешите / с вашего позволения", "example": "Permiso, ¿puedo pasar a buscar mi mochila?", "example_translation": "Разрешите, я могу пройти взять свой рюкзак?", "pos": "noun", "gender": "m"},
      {"word": "bienvenido", "translation": "добро пожаловать", "example": "¡Bienvenido a nuestra escuela y a nuestro grupo!", "example_translation": "Добро пожаловать в нашу школу и в нашу группу!", "pos": "interjection", "gender": null},
      {"word": "ayuda", "translation": "помощь", "example": "Muchas gracias por tu ayuda con la tarea.", "example_translation": "Большое спасибо за твою помощь с уроками.", "pos": "noun", "gender": "f"},
      {"word": "problema", "translation": "проблема", "example": "No hay ningún problema, lo resolvemos juntas.", "example_translation": "Никаких проблем, мы решим это вместе.", "pos": "noun", "gender": "m"}
    ]
  },
  {
    name: "💡 70. Слова, факты и мысли",
    isActiveNow: false,
    words: [
      {"word": "verdad", "translation": "правда", "example": "Siempre digo la verdad a mis amigos.", "example_translation": "Я всегда говорю правду своим друзьям.", "pos": "noun", "gender": "f"},
      {"word": "mentira", "translation": "ложь / неправда", "example": "Decir mentiras no está bien.", "example_translation": "Говорить неправду — это нехорошо.", "pos": "noun", "gender": "f"},
      {"word": "nombre", "translation": "имя", "example": "Mi nombre es Maya y tengo diez años.", "example_translation": "Моё имя Майя, и мне десять лет.", "pos": "noun", "gender": "m"},
      {"word": "número", "translation": "число / номер", "example": "El siete es mi número de la suerte.", "example_translation": "Семь — моё счастливое число.", "pos": "noun", "gender": "m"},
      {"word": "teléfono", "translation": "телефон", "example": "Hablo por teléfono con mi abuela los sábados.", "example_translation": "По субботам я разговариваю по телефону с бабушкой.", "pos": "noun", "gender": "m"},
      {"word": "cosa", "translation": "вещь", "example": "Guardo cada cosa en su lugar en mi cuarto.", "example_translation": "Я храню каждую вещь на своём месте в комнате.", "pos": "noun", "gender": "f"},
      {"word": "manera", "translation": "способ / образ", "example": "Hay una manera fácil y divertida de resolverlo.", "example_translation": "Есть лёгкий и весёлый способ решить это.", "pos": "noun", "gender": "f"},
      {"word": "razón", "translation": "причина / правота", "example": "La seño tiene razón, hay que escuchar con atención.", "example_translation": "Учительница права: нужно слушать внимательно.", "pos": "noun", "gender": "f"},
      {"word": "oportunidad", "translation": "возможность / шанс", "example": "Aprender español es una gran oportunidad para mí.", "example_translation": "Учить испанский — это отличная возможность для меня.", "pos": "noun", "gender": "f"},
      {"word": "suerte", "translation": "удача / везенье", "example": "¡Mucha suerte en tu examen de música!", "example_translation": "Удачи на твоём экзамене по музыке!", "pos": "noun", "gender": "f"}
    ]
  },
];

const DEFAULT_EASE_FACTOR = 2.3;
const FUTURE_REVIEW_DATE = '2099-01-01T00:00:00.000Z';

function seedMaya() {
  const now = new Date().toISOString();
  console.log(`Starting Maya profile & expanded 250-word (40 groups) curriculum seed...`);

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
    // Clean up obsolete groups not in the 30-group definition
    const validNames = new Set(GROUPS_DATA.map((g) => g.name));
    const currentGroups = db.prepare('SELECT id, name FROM vocabulary_groups WHERE profile_id = ?').all(mayaId);
    for (const g of currentGroups) {
      if (!validNames.has(g.name)) {
        console.log(`  - Removing obsolete group: "${g.name}" (ID ${g.id})`);
        db.prepare('DELETE FROM vocabulary_group_members WHERE group_id = ?').run(g.id);
        db.prepare('DELETE FROM vocabulary_groups WHERE id = ?').run(g.id);
      }
    }

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

        const raw = w.word.toLowerCase().replace(/^(el|la|los|las|un|una)\s+/, '').replace(/[¿¡?!]/g, '').trim();
        const slugAscii = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/_+$/, '');
        const autoImageUrl = w.image_url || `/spanish/images/vocab/${slugAscii}.jpg`;

        if (!vocabEntry) {
          const insertInfo = db.prepare(`
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
            w.word, w.translation, w.example, cardNextReview,
            now, mayaId, wordKey, translationKey,
            w.pos, w.gender,
            w.example_translation || null,
            autoImageUrl
          );
          vocabId = Number(insertInfo.lastInsertRowid);
          totalInsertedWords++;
        } else {
          vocabId = Number(vocabEntry.id);
          db.prepare('UPDATE vocabulary SET image_url = COALESCE(image_url, ?) WHERE id = ?').run(autoImageUrl, vocabId);
          if (w.example_translation) {
            db.prepare('UPDATE vocabulary SET example_translation = COALESCE(example_translation, ?) WHERE id = ?').run(w.example_translation, vocabId);
          }
        }

        // Ensure review cards (source_to_target and target_to_source) - only initialize new cards without overwriting existing cards
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
  console.log(`- Groups count: ${db.prepare('SELECT COUNT(*) as c FROM vocabulary_groups WHERE profile_id = ?').get(mayaId).c}`);
  const groupStats = db.prepare(`
    SELECT g.name, COUNT(gm.vocabulary_id) as count
    FROM vocabulary_groups g
    LEFT JOIN vocabulary_group_members gm ON gm.group_id = g.id
    WHERE g.profile_id = ?
    GROUP BY g.id
    ORDER BY g.id ASC
  `).all(mayaId);
  for (const gs of groupStats) {
    console.log(`  • ${gs.name}: ${gs.count} words`);
  }
}

seedMaya();
db.close();
