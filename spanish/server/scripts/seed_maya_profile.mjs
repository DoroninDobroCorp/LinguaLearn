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
  }
];

const DEFAULT_EASE_FACTOR = 2.3;
const FUTURE_REVIEW_DATE = '2099-01-01T00:00:00.000Z';

function seedMaya() {
  const now = new Date().toISOString();
  console.log(`Starting Maya profile & expanded 200-word (30 groups) curriculum seed...`);

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
