import { normalizeAnswer } from './answerMatching.js';

export const DRILL_RUN_MODES = {
  infinite: {
    label: 'Бесконечный',
    taskLimit: null,
  },
  ten: {
    label: '10 заданий',
    taskLimit: 10,
  },
};

export const PRONOUNS = [
  { id: 'yo', label: 'yo', answerAliases: ['yo'] },
  { id: 'tu', label: 'tú', answerAliases: ['tú', 'tu'] },
  { id: 'vos', label: 'vos', answerAliases: ['vos'] },
  { id: 'el', label: 'él / ella / usted', answerAliases: ['él', 'el', 'ella', 'usted'] },
  { id: 'nosotros', label: 'nosotros / nosotras', answerAliases: ['nosotros', 'nosotras'] },
  { id: 'vosotros', label: 'vosotros / vosotras (Испания)', answerAliases: ['vosotros', 'vosotras'] },
  { id: 'ellos', label: 'ellos / ellas / ustedes', answerAliases: ['ellos', 'ellas', 'ustedes'] },
];

export const DRILL_PRONOUN_MODES = {
  all: {
    label: 'Все (tú, vos, vosotros)',
    filter: () => true,
  },
  standard_latam: {
    label: 'Лат. Америка (tú + vos)',
    filter: (p) => p.id !== 'vosotros',
  },
  rioplatense: {
    label: 'Только vos (Аргентина)',
    filter: (p) => p.id !== 'tu' && p.id !== 'vosotros',
  },
  tu_standard: {
    label: 'Только tú (без voseo)',
    filter: (p) => p.id !== 'vos' && p.id !== 'vosotros',
  },
  tu: {
    label: 'Tú',
    filter: (p) => p.id === 'tu',
  },
  vos: {
    label: 'Vos',
    filter: (p) => p.id === 'vos',
  },
  second_person_only: {
    label: 'Только 2-е лицо (tú / vos)',
    filter: (p) => p.id === 'tu' || p.id === 'vos',
  },
};

export const REGULAR_VERBS = [
  { infinitive: 'hablar', ending: 'ar', translation: 'говорить' },
  { infinitive: 'trabajar', ending: 'ar', translation: 'работать' },
  { infinitive: 'estudiar', ending: 'ar', translation: 'учиться' },
  { infinitive: 'comprar', ending: 'ar', translation: 'покупать' },
  { infinitive: 'viajar', ending: 'ar', translation: 'путешествовать' },
  { infinitive: 'necesitar', ending: 'ar', translation: 'нуждаться' },
  { infinitive: 'buscar', ending: 'ar', translation: 'искать' },
  { infinitive: 'escuchar', ending: 'ar', translation: 'слушать' },
  { infinitive: 'esperar', ending: 'ar', translation: 'ждать' },
  { infinitive: 'llamar', ending: 'ar', translation: 'звать' },
  { infinitive: 'comer', ending: 'er', translation: 'есть' },
  { infinitive: 'beber', ending: 'er', translation: 'пить' },
  { infinitive: 'aprender', ending: 'er', translation: 'учить' },
  { infinitive: 'comprender', ending: 'er', translation: 'понимать' },
  { infinitive: 'vender', ending: 'er', translation: 'продавать' },
  { infinitive: 'vivir', ending: 'ir', translation: 'жить' },
  { infinitive: 'escribir', ending: 'ir', translation: 'писать' },
  { infinitive: 'abrir', ending: 'ir', translation: 'открывать' },
];

export const REGULAR_ENDINGS = {
  ar: {
    yo: 'o',
    tu: 'as',
    vos: 'ás',
    el: 'a',
    nosotros: 'amos',
    vosotros: 'áis',
    ellos: 'an',
  },
  er: {
    yo: 'o',
    tu: 'es',
    vos: 'és',
    el: 'e',
    nosotros: 'emos',
    vosotros: 'éis',
    ellos: 'en',
  },
  ir: {
    yo: 'o',
    tu: 'es',
    vos: 'ís',
    el: 'e',
    nosotros: 'imos',
    vosotros: 'ís',
    ellos: 'en',
  },
};

export const FOUR_KEY_VERB_KEYS = ['ser', 'estar', 'tener', 'ir'];

export const IRREGULAR_VERBS = {
  ser: {
    infinitive: 'ser',
    translation: 'быть / являться (суть)',
    pattern: 'unique',
    hint: 'ser: soy, eres, vos sos, es, somos, sois, son',
    forms: { yo: 'soy', tu: 'eres', vos: 'sos', el: 'es', nosotros: 'somos', vosotros: 'sois', ellos: 'son' },
  },
  estar: {
    infinitive: 'estar',
    translation: 'находиться / быть в состоянии',
    pattern: 'unique',
    hint: 'estar: estoy, estás, vos estás, está, estamos, estáis, están',
    forms: { yo: 'estoy', tu: 'estás', vos: 'estás', el: 'está', nosotros: 'estamos', vosotros: 'estáis', ellos: 'están' },
  },
  tener: {
    infinitive: 'tener',
    translation: 'иметь',
    pattern: 'yo_go',
    hint: 'tener: tengo, tienes, vos tenés, tiene, tenemos, tenéis, tienen',
    forms: { yo: 'tengo', tu: 'tienes', vos: 'tenés', el: 'tiene', nosotros: 'tenemos', vosotros: 'tenéis', ellos: 'tienen' },
  },
  ir: {
    infinitive: 'ir',
    translation: 'идти, ехать',
    pattern: 'unique',
    hint: 'ir: voy, vas, vos vas, va, vamos, vais, van',
    forms: { yo: 'voy', tu: 'vas', vos: 'vas', el: 'va', nosotros: 'vamos', vosotros: 'vais', ellos: 'van' },
  },
  hacer: {
    infinitive: 'hacer',
    translation: 'делать, совершать',
    pattern: 'yo_go',
    hint: 'hacer: hago, haces, vos hacés, hace, hacemos, hacéis, hacen',
    forms: { yo: 'hago', tu: 'haces', vos: 'hacés', el: 'hace', nosotros: 'hacemos', vosotros: 'hacéis', ellos: 'hacen' },
  },
  decir: {
    infinitive: 'decir',
    translation: 'говорить, сказать',
    pattern: 'stem_i',
    hint: 'decir: digo, dices, vos decís, dice, decimos, decís, dicen',
    forms: { yo: 'digo', tu: 'dices', vos: 'decís', el: 'dice', nosotros: 'decimos', vosotros: 'decís', ellos: 'dicen' },
  },
  poder: {
    infinitive: 'poder',
    translation: 'мочь, иметь возможность',
    pattern: 'stem_ue',
    hint: 'poder (o->ue): puedo, puedes, vos podés, puede, podemos, podéis, pueden',
    forms: { yo: 'puedo', tu: 'puedes', vos: 'podés', el: 'puede', nosotros: 'podemos', vosotros: 'podéis', ellos: 'pueden' },
  },
  querer: {
    infinitive: 'querer',
    translation: 'хотеть, любить',
    pattern: 'stem_ie',
    hint: 'querer (e->ie): quiero, quieres, vos querés, quiere, queremos, queréis, quieren',
    forms: { yo: 'quiero', tu: 'quieres', vos: 'querés', el: 'quiere', nosotros: 'queremos', vosotros: 'queréis', ellos: 'quieren' },
  },
  saber: {
    infinitive: 'saber',
    translation: 'знать (факты, умения)',
    pattern: 'yo_special',
    hint: 'saber: sé, sabes, vos sabés, sabe, sabemos, sabéis, saben',
    forms: { yo: 'sé', tu: 'sabes', vos: 'sabés', el: 'sabe', nosotros: 'sabemos', vosotros: 'sabéis', ellos: 'saben' },
  },
  poner: {
    infinitive: 'poner',
    translation: 'класть, ставить, включать',
    pattern: 'yo_go',
    hint: 'poner: pongo, pones, vos ponés, pone, ponemos, ponéis, ponen',
    forms: { yo: 'pongo', tu: 'pones', vos: 'ponés', el: 'pone', nosotros: 'ponemos', vosotros: 'ponéis', ellos: 'ponen' },
  },
  salir: {
    infinitive: 'salir',
    translation: 'выходить, уходить',
    pattern: 'yo_go',
    hint: 'salir: salgo, sales, vos salís, sale, salimos, salís, salen',
    forms: { yo: 'salgo', tu: 'sales', vos: 'salís', el: 'sale', nosotros: 'salimos', vosotros: 'salís', ellos: 'salen' },
  },
  venir: {
    infinitive: 'venir',
    translation: 'приходить, приезжать',
    pattern: 'yo_go',
    hint: 'venir: vengo, vienes, vos venís, viene, venimos, venís, vienen',
    forms: { yo: 'vengo', tu: 'vienes', vos: 'venís', el: 'viene', nosotros: 'venimos', vosotros: 'venís', ellos: 'vienen' },
  },
  ver: {
    infinitive: 'ver',
    translation: 'видеть, смотреть',
    pattern: 'yo_special',
    hint: 'ver: veo, ves, vos ves, ve, vemos, veis, ven',
    forms: { yo: 'veo', tu: 'ves', vos: 'ves', el: 've', nosotros: 'vemos', vosotros: 'veis', ellos: 'ven' },
  },
  dar: {
    infinitive: 'dar',
    translation: 'давать',
    pattern: 'yo_special',
    hint: 'dar: doy, das, vos das, da, damos, dais, dan',
    forms: { yo: 'doy', tu: 'das', vos: 'das', el: 'da', nosotros: 'damos', vosotros: 'dais', ellos: 'dan' },
  },
  pedir: {
    infinitive: 'pedir',
    translation: 'просить, заказывать',
    pattern: 'stem_i',
    hint: 'pedir (e->i): pido, pides, vos pedís, pide, pedimos, pedís, piden',
    forms: { yo: 'pido', tu: 'pides', vos: 'pedís', el: 'pide', nosotros: 'pedimos', vosotros: 'pedís', ellos: 'piden' },
  },
  dormir: {
    infinitive: 'dormir',
    translation: 'спать',
    pattern: 'stem_ue',
    hint: 'dormir (o->ue): duermo, duermes, vos dormís, duerme, dormimos, dormís, duermen',
    forms: { yo: 'duermo', tu: 'duermes', vos: 'dormís', el: 'duerme', nosotros: 'dormimos', vosotros: 'dormís', ellos: 'duermen' },
  },
  volver: {
    infinitive: 'volver',
    translation: 'возвращаться',
    pattern: 'stem_ue',
    hint: 'volver (o->ue): vuelvo, vuelves, vos volvés, vuelve, volvemos, volvéis, vuelven',
    forms: { yo: 'vuelvo', tu: 'vuelves', vos: 'volvés', el: 'vuelve', nosotros: 'volvemos', vosotros: 'volvéis', ellos: 'vuelven' },
  },
  jugar: {
    infinitive: 'jugar',
    translation: 'играть',
    pattern: 'stem_ue',
    hint: 'jugar (u->ue): juego, juegas, vos jugás, juega, jugamos, jugáis, juegan',
    forms: { yo: 'juego', tu: 'juegas', vos: 'jugás', el: 'juega', nosotros: 'jugamos', vosotros: 'jugáis', ellos: 'juegan' },
  },
  sentir: {
    infinitive: 'sentir',
    translation: 'чувствовать',
    pattern: 'stem_ie',
    hint: 'sentir (e->ie): siento, sientes, vos sentís, siente, sentimos, sentís, sienten',
    forms: { yo: 'siento', tu: 'sientes', vos: 'sentís', el: 'siente', nosotros: 'sentimos', vosotros: 'sentís', ellos: 'sienten' },
  },
  preferir: {
    infinitive: 'preferir',
    translation: 'предпочитать',
    pattern: 'stem_ie',
    hint: 'preferir (e->ie): prefiero, prefieres, vos preferís, prefiere, preferimos, preferís, prefieren',
    forms: { yo: 'prefiero', tu: 'prefieres', vos: 'preferís', el: 'prefiere', nosotros: 'preferimos', vosotros: 'preferís', ellos: 'prefieren' },
  },
  pensar: {
    infinitive: 'pensar',
    translation: 'думать',
    pattern: 'stem_ie',
    hint: 'pensar (e->ie): pienso, piensas, vos pensás, piensa, pensamos, pensáis, piensan',
    forms: { yo: 'pienso', tu: 'piensas', vos: 'pensás', el: 'piensa', nosotros: 'pensamos', vosotros: 'pensáis', ellos: 'piensan' },
  },
  entender: {
    infinitive: 'entender',
    translation: 'понимать',
    pattern: 'stem_ie',
    hint: 'entender (e->ie): entiendo, entiendes, vos entendés, entiende, entendemos, entendéis, entienden',
    forms: { yo: 'entiendo', tu: 'entiendes', vos: 'entendés', el: 'entiende', nosotros: 'entendemos', vosotros: 'entendéis', ellos: 'entienden' },
  },
  conocer: {
    infinitive: 'conocer',
    translation: 'знать (людей, места), знакомиться',
    pattern: 'yo_zco',
    hint: 'conocer: conozco, conoces, vos conocés, conoce, conocemos, conocéis, conocen',
    forms: { yo: 'conozco', tu: 'conoces', vos: 'conocés', el: 'conoce', nosotros: 'conocemos', vosotros: 'conocéis', ellos: 'conocen' },
  },
  traer: {
    infinitive: 'traer',
    translation: 'приносить',
    pattern: 'yo_go',
    hint: 'traer: traigo, traes, vos traés, trae, traemos, traéis, traen',
    forms: { yo: 'traigo', tu: 'traes', vos: 'traés', el: 'trae', nosotros: 'traemos', vosotros: 'traéis', ellos: 'traen' },
  },
  oír: {
    infinitive: 'oír',
    translation: 'слышать',
    pattern: 'yo_special',
    hint: 'oír: oigo, oyes, vos oís, oye, oímos, oís, oyen',
    forms: { yo: 'oigo', tu: 'oyes', vos: 'oís', el: 'oye', nosotros: 'oímos', vosotros: 'oís', ellos: 'oyen' },
  },
  seguir: {
    infinitive: 'seguir',
    translation: 'следовать, продолжать',
    pattern: 'stem_i',
    hint: 'seguir (e->i): sigo, sigues, vos seguís, sigue, seguimos, seguís, siguen',
    forms: { yo: 'sigo', tu: 'sigues', vos: 'seguís', el: 'sigue', nosotros: 'seguimos', vosotros: 'seguís', ellos: 'siguen' },
  },
  repetir: {
    infinitive: 'repetir',
    translation: 'повторять',
    pattern: 'stem_i',
    hint: 'repetir (e->i): repito, repites, vos repetís, repite, repetimos, repetís, repiten',
    forms: { yo: 'repito', tu: 'repites', vos: 'repetís', el: 'repite', nosotros: 'repetimos', vosotros: 'repetís', ellos: 'repiten' },
  },
  servir: {
    infinitive: 'servir',
    translation: 'служить, подавать',
    pattern: 'stem_i',
    hint: 'servir (e->i): sirvo, sirves, vos servís, sirve, servimos, servís, sirven',
    forms: { yo: 'sirvo', tu: 'sirves', vos: 'servís', el: 'sirve', nosotros: 'servimos', vosotros: 'servís', ellos: 'sirven' },
  },
  morir: {
    infinitive: 'morir',
    translation: 'умирать',
    pattern: 'stem_ue',
    hint: 'morir (o->ue): muero, mueres, vos morís, muere, morimos, morís, mueren',
    forms: { yo: 'muero', tu: 'mueres', vos: 'morís', el: 'muere', nosotros: 'morimos', vosotros: 'morís', ellos: 'mueren' },
  },
  valer: {
    infinitive: 'valer',
    translation: 'стоить, иметь ценность',
    pattern: 'yo_go',
    hint: 'valer: valgo, vales, vos valés, vale, valemos, valéis, valen',
    forms: { yo: 'valgo', tu: 'vales', vos: 'valés', el: 'vale', nosotros: 'valemos', vosotros: 'valéis', ellos: 'valen' },
  },
  traducir: {
    infinitive: 'traducir',
    translation: 'переводить',
    pattern: 'yo_zco',
    hint: 'traducir: traduzco, traduces, vos traducís, traduce, traducimos, traducís, traducen',
    forms: { yo: 'traduzco', tu: 'traduces', vos: 'traducís', el: 'traduce', nosotros: 'traducimos', vosotros: 'traducís', ellos: 'traducen' },
  },
  producir: {
    infinitive: 'producir',
    translation: 'производить',
    pattern: 'yo_zco',
    hint: 'producir: produzco, produces, vos producís, produce, producimos, producís, producen',
    forms: { yo: 'produzco', tu: 'produces', vos: 'producís', el: 'produce', nosotros: 'producimos', vosotros: 'producís', ellos: 'producen' },
  },
  conducir: {
    infinitive: 'conducir',
    translation: 'водить машину',
    pattern: 'yo_zco',
    hint: 'conducir: conduzco, conduces, vos conducís, conduce, conducimos, conducís, conducen',
    forms: { yo: 'conduzco', tu: 'conduces', vos: 'conducís', el: 'conduce', nosotros: 'conducimos', vosotros: 'conducís', ellos: 'conducen' },
  },
  caer: {
    infinitive: 'caer',
    translation: 'падать',
    pattern: 'yo_go',
    hint: 'caer: caigo, caes, vos caés, cae, caemos, caéis, caen',
    forms: { yo: 'caigo', tu: 'caes', vos: 'caés', el: 'cae', nosotros: 'caemos', vosotros: 'caéis', ellos: 'caen' },
  },
  empezar: {
    infinitive: 'empezar',
    translation: 'начинать',
    pattern: 'stem_ie',
    hint: 'empezar (e->ie): empiezo, empiezas, vos empezás, empieza, empezamos, empezáis, empiezan',
    forms: { yo: 'empiezo', tu: 'empiezas', vos: 'empezás', el: 'empieza', nosotros: 'empezamos', vosotros: 'empezáis', ellos: 'empiezan' },
  },
  comenzar: {
    infinitive: 'comenzar',
    translation: 'начинать (синоним)',
    pattern: 'stem_ie',
    hint: 'comenzar (e->ie): comienzo, comienzas, vos comenzás, comienza, comenzamos, comenzáis, comienzan',
    forms: { yo: 'comienzo', tu: 'comienzas', vos: 'comenzás', el: 'comienza', nosotros: 'comenzamos', vosotros: 'comenzáis', ellos: 'comienzan' },
  },
  cerrar: {
    infinitive: 'cerrar',
    translation: 'закрывать',
    pattern: 'stem_ie',
    hint: 'cerrar (e->ie): cierro, cierras, vos cerrás, cierra, cerramos, cerráis, cierran',
    forms: { yo: 'cierro', tu: 'cierras', vos: 'cerrás', el: 'cierra', nosotros: 'cerramos', vosotros: 'cerráis', ellos: 'cierran' },
  },
  recordar: {
    infinitive: 'recordar',
    translation: 'помнить, вспоминать',
    pattern: 'stem_ue',
    hint: 'recordar (o->ue): recuerdo, recuerdas, vos recordás, recuerda, recordamos, recordáis, recuerdan',
    forms: { yo: 'recuerdo', tu: 'recuerdas', vos: 'recordás', el: 'recuerda', nosotros: 'recordamos', vosotros: 'recordáis', ellos: 'recuerdan' },
  },
  encontrar: {
    infinitive: 'encontrar',
    translation: 'находить',
    pattern: 'stem_ue',
    hint: 'encontrar (o->ue): encuentro, encuentras, vos encontrás, encuentra, encontramos, encontráis, encuentran',
    forms: { yo: 'encuentro', tu: 'encuentras', vos: 'encontrás', el: 'encuentra', nosotros: 'encontramos', vosotros: 'encontráis', ellos: 'encuentran' },
  },
  perder: {
    infinitive: 'perder',
    translation: 'терять, проигрывать',
    pattern: 'stem_ie',
    hint: 'perder (e->ie): pierdo, pierdes, vos perdés, pierde, perdemos, perdéis, pierden',
    forms: { yo: 'pierdo', tu: 'pierdes', vos: 'perdés', el: 'pierde', nosotros: 'perdemos', vosotros: 'perdéis', ellos: 'pierden' },
  },
  almorzar: {
    infinitive: 'almorzar',
    translation: 'обедать',
    pattern: 'stem_ue',
    hint: 'almorzar (o->ue): almuerzo, almuerzas, vos almorzás, almuerza, almorzamos, almorzáis, almuerzan',
    forms: { yo: 'almuerzo', tu: 'almuerzas', vos: 'almorzás', el: 'almuerza', nosotros: 'almorzamos', vosotros: 'almorzáis', ellos: 'almuerzan' },
  },
  volar: {
    infinitive: 'volar',
    translation: 'летать',
    pattern: 'stem_ue',
    hint: 'volar (o->ue): vuelo, vuelas, vos volás, vuela, volamos, voláis, vuelan',
    forms: { yo: 'vuelo', tu: 'vuelas', vos: 'volás', el: 'vuela', nosotros: 'volamos', vosotros: 'voláis', ellos: 'vuelan' },
  },
  soñar: {
    infinitive: 'soñar',
    translation: 'мечтать, видеть сны',
    pattern: 'stem_ue',
    hint: 'soñar (o->ue): sueño, sueñas, vos soñás, sueña, soñamos, soñáis, sueñan',
    forms: { yo: 'sueño', tu: 'sueñas', vos: 'soñás', el: 'sueña', nosotros: 'soñamos', vosotros: 'soñáis', ellos: 'sueñan' },
  },
  costar: {
    infinitive: 'costar',
    translation: 'стоить',
    pattern: 'stem_ue',
    hint: 'costar (o->ue): cuesto, cuestas, vos costás, cuesta, costamos, costáis, cuestan',
    forms: { yo: 'cuesto', tu: 'cuestas', vos: 'costás', el: 'cuesta', nosotros: 'costamos', vosotros: 'costáis', ellos: 'cuestan' },
  },
  demostrar: {
    infinitive: 'demostrar',
    translation: 'демонстрировать, доказывать',
    pattern: 'stem_ue',
    hint: 'demostrar (o->ue): demuestro, demuestras, vos demostrás, demuestra, demostramos, demostráis, demuestran',
    forms: { yo: 'demuestro', tu: 'demuestras', vos: 'demostrás', el: 'demuestra', nosotros: 'demostramos', vosotros: 'demostráis', ellos: 'demuestran' },
  },
  despertar: {
    infinitive: 'despertar',
    translation: 'будить / просыпаться',
    pattern: 'stem_ie',
    hint: 'despertar (e->ie): despierto, despiertas, vos despertás, despierta, despertamos, despertáis, despiertan',
    forms: { yo: 'despierto', tu: 'despiertas', vos: 'despertás', el: 'despierta', nosotros: 'despertamos', vosotros: 'despertáis', ellos: 'despiertan' },
  },
  divertir: {
    infinitive: 'divertir',
    translation: 'развлекать, веселить',
    pattern: 'stem_ie',
    hint: 'divertir (e->ie): divierto, diviertes, vos divertís, divierte, divertimos, divertís, divierten',
    forms: { yo: 'divierto', tu: 'diviertes', vos: 'divertís', el: 'divierte', nosotros: 'divertimos', vosotros: 'divertís', ellos: 'divierten' },
  },
  mentir: {
    infinitive: 'mentir',
    translation: 'лгать',
    pattern: 'stem_ie',
    hint: 'mentir (e->ie): miento, mientes, vos mentís, miente, mentimos, mentís, mienten',
    forms: { yo: 'miento', tu: 'mientes', vos: 'mentís', el: 'miente', nosotros: 'mentimos', vosotros: 'mentís', ellos: 'mienten' },
  },
  sugerir: {
    infinitive: 'sugerir',
    translation: 'предлагать, намекать',
    pattern: 'stem_ie',
    hint: 'sugerir (e->ie): sugiero, sugieres, vos sugerís, sugiere, sugerimos, sugerís, sugieren',
    forms: { yo: 'sugiero', tu: 'sugieres', vos: 'sugerís', el: 'sugiere', nosotros: 'sugerimos', vosotros: 'sugerís', ellos: 'sugieren' },
  },
  agradecer: {
    infinitive: 'agradecer',
    translation: 'благодарить',
    pattern: 'yo_zco',
    hint: 'agradecer: agradezco, agradeces, vos agradecés, agradece, agradecemos, agradecéis, agradecen',
    forms: { yo: 'agradezco', tu: 'agradeces', vos: 'agradecés', el: 'agradece', nosotros: 'agradecemos', vosotros: 'agradecéis', ellos: 'agradecen' },
  },
  ofrecer: {
    infinitive: 'ofrecer',
    translation: 'предлагать',
    pattern: 'yo_zco',
    hint: 'ofrecer: ofrezco, ofreces, vos ofrecés, ofrece, ofrecemos, ofrecéis, ofrecen',
    forms: { yo: 'ofrezco', tu: 'ofreces', vos: 'ofrecés', el: 'ofrece', nosotros: 'ofrecemos', vosotros: 'ofrecéis', ellos: 'ofrecen' },
  },
  parecer: {
    infinitive: 'parecer',
    translation: 'казаться',
    pattern: 'yo_zco',
    hint: 'parecer: parezco, pareces, vos parecés, parece, parecemos, parecéis, parecen',
    forms: { yo: 'parezco', tu: 'pareces', vos: 'parecés', el: 'parece', nosotros: 'parecemos', vosotros: 'parecéis', ellos: 'parecen' },
  },
  reconocer: {
    infinitive: 'reconocer',
    translation: 'узнавать, признавать',
    pattern: 'yo_zco',
    hint: 'reconocer: reconozco, reconoces, vos reconocés, reconoce, reconocemos, reconocéis, reconocen',
    forms: { yo: 'reconozco', tu: 'reconoces', vos: 'reconocés', el: 'reconoce', nosotros: 'reconocemos', vosotros: 'reconocéis', ellos: 'reconocen' },
  },
  haber: {
    infinitive: 'haber',
    translation: 'вспомогательный глагол',
    pattern: 'unique',
    hint: 'haber: he, has, vos has, ha (hay), hemos, habéis, han',
    forms: { yo: 'he', tu: 'has', vos: 'has', el: 'ha', nosotros: 'hemos', vosotros: 'habéis', ellos: 'han' },
  },
  oler: {
    infinitive: 'oler',
    translation: 'нюхать, пахнуть',
    pattern: 'unique',
    hint: 'oler: huelo, hueles, vos olés, huele, olemos, oléis, huelen',
    forms: { yo: 'huelo', tu: 'hueles', vos: 'olés', el: 'huele', nosotros: 'olemos', vosotros: 'oléis', ellos: 'huelen' },
  },
  huir: {
    infinitive: 'huir',
    translation: 'бежать, спасаться',
    pattern: 'unique',
    hint: 'huir: huyo, huyes, vos huís, huye, huimos, huís, huyen',
    forms: { yo: 'huyo', tu: 'huyes', vos: 'huís', el: 'huye', nosotros: 'huimos', vosotros: 'huís', ellos: 'huyen' },
  },
  mantener: {
    infinitive: 'mantener',
    translation: 'держать, поддерживать',
    pattern: 'yo_go',
    hint: 'mantener: mantengo, mantienes, vos mantenés, mantiene, mantenemos, mantenéis, mantienen',
    forms: { yo: 'mantengo', tu: 'mantienes', vos: 'mantenés', el: 'mantiene', nosotros: 'mantenemos', vosotros: 'mantenéis', ellos: 'mantienen' },
  },
  sostener: {
    infinitive: 'sostener',
    translation: 'держать, утверждать',
    pattern: 'yo_go',
    hint: 'sostener: sostengo, sostienes, vos sostenés, sostiene, sostenemos, sostenéis, sostienen',
    forms: { yo: 'sostengo', tu: 'sostienes', vos: 'sostenés', el: 'sostiene', nosotros: 'sostenemos', vosotros: 'sostenéis', ellos: 'sostienen' },
  },
  proponer: {
    infinitive: 'proponer',
    translation: 'предлагать',
    pattern: 'yo_go',
    hint: 'proponer: propongo, propones, vos proponés, propone, proponemos, proponéis, proponen',
    forms: { yo: 'propongo', tu: 'propones', vos: 'proponés', el: 'propone', nosotros: 'proponemos', vosotros: 'proponéis', ellos: 'proponen' },
  },
  suponer: {
    infinitive: 'suponer',
    translation: 'предполагать',
    pattern: 'yo_go',
    hint: 'suponer: supongo, supones, vos suponés, supone, suponemos, suponéis, suponen',
    forms: { yo: 'supongo', tu: 'supones', vos: 'suponés', el: 'supone', nosotros: 'suponemos', vosotros: 'suponéis', ellos: 'suponen' },
  },
};

export const ALL_IRREGULAR_KEYS = Object.keys(IRREGULAR_VERBS);

export const IRREGULAR_VERB_GROUPS = {
  group_stem_ie: {
    label: 'Группа e ➔ ie (querer, pensar, entender...)',
    topic: 'Present tense irregular verbs (ir/hacer/decir)',
    level: 'A1',
    category: 'stem',
    verbs: ['querer', 'pensar', 'entender', 'preferir', 'sentir', 'cerrar', 'empezar', 'comenzar', 'perder', 'despertar', 'divertir', 'mentir', 'sugerir'],
    rules: [
      'В корне под ударением буква e переходит в дифтонг ie (yo, tú, él, ellos).',
      'В nosotros, vosotros и аргентинском vos корень НЕ меняется: nosotros queremos, vosotros queréis, vos querés.',
    ],
  },
  group_stem_ue: {
    label: 'Группа o / u ➔ ue (poder, dormir, volver, jugar...)',
    topic: 'Present tense irregular verbs (ir/hacer/decir)',
    level: 'A1',
    category: 'stem',
    verbs: ['poder', 'dormir', 'volver', 'jugar', 'recordar', 'encontrar', 'costar', 'almorzar', 'volar', 'soñar', 'morir', 'demostrar'],
    rules: [
      'В корне под ударением гласная o или u переходит в ue (yo puedo, tú duermes, él juega).',
      'В nosotros, vosotros и vos чередования нет: nosotros podemos, vos podés, vos volvés, vos jugás.',
    ],
  },
  group_stem_i: {
    label: 'Группа e ➔ i (pedir, servir, repetir, seguir...)',
    topic: 'Present tense irregular verbs (ir/hacer/decir)',
    level: 'A1',
    category: 'stem',
    verbs: ['pedir', 'servir', 'repetir', 'seguir', 'decir'],
    rules: [
      'Буква e переходит в i в 1-м, 2-м и 3-м лице (pido, pides, pide, piden).',
      'Формы nosotros/vosotros/vos сохраняют базовую e: pedimos, vosotros pedís, vos pedís.',
    ],
  },
  group_yo: {
    label: 'Особое 1-е лицо Yo (-go, -zco, sé, doy, veo)',
    topic: 'Present tense irregular verbs (ir/hacer/decir)',
    level: 'A1',
    category: 'yo',
    verbs: ['hacer', 'poner', 'salir', 'venir', 'tener', 'traer', 'valer', 'caer', 'conocer', 'traducir', 'conducir', 'producir', 'agradecer', 'ofrecer', 'parecer', 'reconocer', 'saber', 'dar', 'ver', 'oír'],
    rules: [
      'Только форма "yo" имеет особую основу: -go (hago, pongo, salgo, vengo, tengo, traigo, valgo, caigo), -zco (conozco, traduzco, conduzco), sé, doy, veo.',
      'Остальные лица спрягаются по стандартным правилам соответствующего спряжения.',
    ],
  },
};

export const SER_ESTAR_CONTEXTS = [
  { pronounId: 'yo', sentence: 'Yo ___ estudiante.', translation: 'Я студент.', verb: 'ser', reason: 'occupation -> ser' },
  { pronounId: 'yo', sentence: 'Yo ___ de Madrid.', translation: 'Я из Мадрида.', verb: 'ser', reason: 'origin -> ser' },
  { pronounId: 'yo', sentence: 'Yo ___ en la oficina ahora.', translation: 'Я в офисе сейчас.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'yo', sentence: 'Yo ___ cansado.', translation: 'Я устал.', verb: 'estar', reason: 'temporary condition -> estar' },
  { pronounId: 'yo', sentence: 'Yo ___ muy feliz hoy.', translation: 'Я очень счастлив сегодня.', verb: 'estar', reason: 'emotion -> estar' },
  { pronounId: 'tu', sentence: 'Tú ___ muy inteligente.', translation: 'Ты очень умный.', verb: 'ser', reason: 'permanent characteristic -> ser' },
  { pronounId: 'tu', sentence: 'Tú ___ cansado hoy.', translation: 'Ты уставший сегодня.', verb: 'estar', reason: 'temporary state -> estar' },
  { pronounId: 'tu', sentence: 'Tú ___ de Colombia.', translation: 'Ты из Колумбии.', verb: 'ser', reason: 'origin -> ser' },
  { pronounId: 'tu', sentence: 'Tú ___ en el supermercado.', translation: 'Ты в супермаркете.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'vos', sentence: 'Vos ___ de Buenos Aires.', translation: 'Ты из Буэнос-Айреса.', verb: 'ser', reason: 'origin -> ser' },
  { pronounId: 'vos', sentence: 'Vos ___ ocupado ahora.', translation: 'Ты занят сейчас.', verb: 'estar', reason: 'temporary state -> estar' },
  { pronounId: 'vos', sentence: 'Vos ___ un buen amigo.', translation: 'Ты хороший друг.', verb: 'ser', reason: 'identity -> ser' },
  { pronounId: 'vos', sentence: 'Vos ___ listo para salir.', translation: 'Ты готов выходить.', verb: 'estar', reason: 'readiness -> estar' },
  { pronounId: 'el', sentence: 'Él ___ médico.', translation: 'Он врач.', verb: 'ser', reason: 'profession -> ser' },
  { pronounId: 'el', sentence: 'Él ___ enfermo esta semana.', translation: 'Он болен на этой неделе.', verb: 'estar', reason: 'health/condition -> estar' },
  { pronounId: 'el', sentence: 'Ella ___ de España.', translation: 'Она из Испании.', verb: 'ser', reason: 'origin -> ser' },
  { pronounId: 'el', sentence: 'El café ___ caliente.', translation: 'Кофе горячий.', verb: 'estar', reason: 'temperature -> estar' },
  { pronounId: 'el', sentence: 'La sopa ___ fría.', translation: 'Суп холодный.', verb: 'estar', reason: 'condition -> estar' },
  { pronounId: 'el', sentence: 'El hotel ___ en el centro.', translation: 'Отель в центре.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'el', sentence: 'El auto ___ rojo.', translation: 'Машина красная.', verb: 'ser', reason: 'color/description -> ser' },
  { pronounId: 'el', sentence: 'La mesa ___ de madera.', translation: 'Стол из дерева.', verb: 'ser', reason: 'material -> ser' },
  { pronounId: 'el', sentence: 'La puerta ___ abierta.', translation: 'Дверь открыта.', verb: 'estar', reason: 'state -> estar' },
  { pronounId: 'el', sentence: 'La puerta ___ cerrada.', translation: 'Дверь закрыта.', verb: 'estar', reason: 'state -> estar' },
  { pronounId: 'el', sentence: 'La reunión ___ a las tres.', translation: 'Встреча в три часа.', verb: 'ser', reason: 'event time -> ser' },
  { pronounId: 'nosotros', sentence: 'Nosotros ___ amigos desde niños.', translation: 'Мы друзья с детства.', verb: 'ser', reason: 'relationship -> ser' },
  { pronounId: 'nosotros', sentence: 'Nosotros ___ listos para salir.', translation: 'Мы готовы выходить.', verb: 'estar', reason: 'readiness -> estar' },
  { pronounId: 'nosotros', sentence: 'Nosotros ___ en Barcelona.', translation: 'Мы в Барселоне.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'nosotros', sentence: 'Nosotros ___ profesores.', translation: 'Мы преподаватели.', verb: 'ser', reason: 'profession -> ser' },
  { pronounId: 'vosotros', sentence: 'Vosotros ___ de España.', translation: 'Вы из Испании.', verb: 'ser', reason: 'origin -> ser' },
  { pronounId: 'vosotros', sentence: 'Vosotros ___ в casa.', translation: 'Вы дома.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'vosotros', sentence: 'Vosotros ___ simpáticos.', translation: 'Вы приятные.', verb: 'ser', reason: 'trait -> ser' },
  { pronounId: 'vosotros', sentence: 'Vosotros ___ cansados.', translation: 'Вы устали.', verb: 'estar', reason: 'state -> estar' },
  { pronounId: 'ellos', sentence: 'Ellos ___ en la playa.', translation: 'Они на пляже.', verb: 'estar', reason: 'location -> estar' },
  { pronounId: 'ellos', sentence: 'Mis padres ___ muy pacientes.', translation: 'Мои родители очень терпеливые.', verb: 'ser', reason: 'character trait -> ser' },
  { pronounId: 'ellos', sentence: 'Ellos ___ argentinos.', translation: 'Они аргентинцы.', verb: 'ser', reason: 'nationality -> ser' },
  { pronounId: 'ellos', sentence: 'Las ventanas ___ limpias.', translation: 'Окна чистые.', verb: 'estar', reason: 'condition -> estar' },
  { pronounId: 'ellos', sentence: 'Ellos ___ ocupados.', translation: 'Они заняты.', verb: 'estar', reason: 'state -> estar' },
  { pronounId: 'el', sentence: 'La película ___ aburrida.', translation: 'Фильм скучный.', verb: 'ser', reason: 'inherent quality -> ser' },
  { pronounId: 'el', sentence: 'El niño ___ aburrido ahora.', translation: 'Мальчику сейчас скучно.', verb: 'estar', reason: 'temporary feeling -> estar' },
  { pronounId: 'el', sentence: 'El concierto ___ en el teatro.', translation: 'Концерт в театре.', verb: 'ser', reason: 'event venue -> ser' },
  { pronounId: 'el', sentence: 'El teatro ___ cerca del parque.', translation: 'Театр рядом с парком.', verb: 'estar', reason: 'building location -> estar' },
  { pronounId: 'yo', sentence: 'Yo ___ de Argentina.', translation: 'Я из Аргентины.', verb: 'ser', reason: 'origin -> ser' }
];

export const DRILL_TYPES = {
  allIrregulars: {
    label: '⚡ Все неправильные глаголы (60 глаголов словаря)',
    topic: 'Present tense irregular verbs (ir/hacer/decir)',
    level: 'A1',
    rules: [
      'Отработка всех 60 неправильных глаголов из вашего словаря (включая voseo).',
      'Включает отклоняющиеся глаголы (e->ie, o->ue, e->i) и особые формы 1-го лица (-go, -zco, sé, doy, veo).',
    ],
  },
  fourKeyVerbs: {
    label: '4 главных глагола (ser, estar, tener, ir)',
    topic: 'Present tense irregular verbs (ir/hacer/decir)',
    level: 'A1',
    rules: [
      'ser (быть): yo soy, tú eres, vos sos, él es, nosotros somos, vosotros sois, ellos son.',
      'estar (находиться): yo estoy, tú estás, vos estás, él está, nosotros estamos, vosotros estáis, ellos están.',
      'tener (иметь): yo tengo, tú tienes, vos tenés, él tiene, nosotros tenemos, vosotros tenéis, ellos tienen.',
      'ir (идти, ехать): yo voy, tú vas, vos vas, él va, nosotros vamos, vosotros vais, ellos van.',
    ],
  },
  group_stem_ie: {
    label: 'Группа e ➔ ie (querer, pensar, entender...)',
    topic: 'Present tense irregular verbs (ir/hacer/decir)',
    level: 'A1',
    rules: [
      'e -> ie под ударением во всех лицах, КРОМЕ nosotros, vosotros и vos (в Аргентине: querés, pensás, entendés).',
    ],
  },
  group_stem_ue: {
    label: 'Группа o / u ➔ ue (poder, dormir, volver, jugar...)',
    topic: 'Present tense irregular verbs (ir/hacer/decir)',
    level: 'A1',
    rules: [
      'o/u -> ue под ударением (puedo, duermes, vuelve, juega), но nosotros podemos, vos podés, vos volvés, vos jugás.',
    ],
  },
  group_stem_i: {
    label: 'Группа e ➔ i (pedir, servir, repetir, seguir...)',
    topic: 'Present tense irregular verbs (ir/hacer/decir)',
    level: 'A1',
    rules: [
      'e -> i в формах pido, pides, pide, piden. Формы nosotros pedimos, vosotros pedís, vos pedís.',
    ],
  },
  group_yo: {
    label: 'Особое 1-е лицо Yo (-go, -zco, sé, doy, veo)',
    topic: 'Present tense irregular verbs (ir/hacer/decir)',
    level: 'A1',
    rules: [
      'Особая форма 1-го лица: hago, pongo, salgo, vengo, traigo, conozco, traduzco, sé, doy, veo, oigo.',
    ],
  },
  singleVerb: {
    label: '🎯 Выбрать конкретный глагол (из 60)',
    topic: 'Present tense irregular verbs (ir/hacer/decir)',
    level: 'A1',
    rules: [
      'Индивидуальная тренировка выбранного глагола во всех лицах и числах.',
    ],
  },
  regular: {
    label: 'Правильные глаголы (-ar, -er, -ir)',
    topic: 'Present tense regular -ar verbs',
    level: 'A1',
    rules: [
      '-ar: yo -o, tú -as, vos -ás, él -a, nosotros -amos, vosotros -áis (Испания), ellos/ustedes -an.',
      '-er: yo -o, tú -es, vos -és, él -e, nosotros -emos, vosotros -éis (Испания), ellos/ustedes -en.',
      '-ir: yo -o, tú -es, vos -ís, él -e, nosotros -imos, vosotros -ís (Испания), ellos/ustedes -en.',
    ],
  },
  serEstar: {
    label: 'Ser vs Estar в контексте (предложения)',
    topic: 'Ser vs Estar (basic)',
    level: 'A1',
    rules: [
      'Формы Ser: soy / eres / sos / es / somos / sois (Испания) / son.',
      'Формы Estar: estoy / estás / está / estamos / estáis (Испания) / están.',
      'Ser — для постоянных качеств, профессии, происхождения, времени событий.',
      'Estar — для местоположения, временных состояний, настроения, самочувствия.',
    ],
  },
  hacerDecir: {
    label: 'Hacer и Decir (неправильные)',
    topic: 'Present tense irregular verbs (ir/hacer/decir)',
    level: 'A1',
    rules: [
      'hacer (делать): yo hago, tú haces, vos hacés, él hace, nosotros hacemos, vosotros hacéis (Испания), они: ellos/ustedes hacen.',
      'decir (сказать): yo digo, tú dices, vos decís, él dice, nosotros decimos, vosotros decís (Испания), ellos/ustedes dicen.',
    ],
  },
  ser: {
    label: 'Ser (быть)',
    topic: 'Ser vs Estar (basic)',
    level: 'A1',
    rules: [
      'ser (неправильный): yo soy, tú eres, vos sos, él/ella/usted es, nosotros somos, vosotros sois (Испания), ellos/ustedes son.',
    ],
  },
  estar: {
    label: 'Estar (находиться)',
    topic: 'Ser vs Estar (basic)',
    level: 'A1',
    rules: [
      'estar (неправильный): yo estoy, tú estás, vos estás, él/ella/usted está, nosotros estamos, vosotros estáis (Испания), ellos/ustedes están.',
    ],
  },
  tener: {
    label: 'Tener (иметь)',
    topic: 'Tener (to have) and tener expressions',
    level: 'A1',
    rules: [
      'tener (неправильный): yo tengo, tú tienes, vos tenés, él/ella/usted tiene, nosotros tenemos, vosotros tenéis (Испания), ellos/ustedes tienen.',
    ],
  },
  ir: {
    label: 'Ir (идти)',
    topic: 'Present tense irregular verbs (ir/hacer/decir)',
    level: 'A1',
    rules: [
      'ir (неправильный): yo voy, tú vas, vos vas, él/ella/usted va, nosotros vamos, vosotros vais (Испания), они: ellos/ustedes van.',
    ],
  },
  hacer: {
    label: 'Hacer (делать)',
    topic: 'Present tense irregular verbs (ir/hacer/decir)',
    level: 'A1',
    rules: [
      'hacer (неправильный): yo hago, tú haces, vos hacés, él/ella/usted hace, nosotros hacemos, vosotros hacéis (Испания), ellos/ustedes hacen.',
    ],
  },
  decir: {
    label: 'Decir (сказать)',
    topic: 'Present tense irregular verbs (ir/hacer/decir)',
    level: 'A1',
    rules: [
      'decir (неправильный): yo digo, tú dices, vos decís, él/ella/usted dice, nosotros decimos, vosotros decís (Испания), ellos/ustedes dicen.',
    ],
  },
};

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

function conjugateRegularVerb(verb, pronounId) {
  const root = verb.infinitive.slice(0, -2);
  const ending = REGULAR_ENDINGS[verb.ending][pronounId];
  return `${root}${ending}`;
}

export function conjugateVerb(drillType, verb, pronounId) {
  if (drillType === 'regular') {
    return conjugateRegularVerb(verb, pronounId);
  }

  const irregularKey = (drillType === 'fourKeyVerbs' || drillType === 'hacerDecir' || drillType === 'allIrregulars' || String(drillType).startsWith('group_'))
    ? (verb?.infinitive || 'ser')
    : (verb?.infinitive || drillType);
  if (IRREGULAR_VERBS[irregularKey]) {
    return IRREGULAR_VERBS[irregularKey].forms[pronounId];
  }
  return IRREGULAR_VERBS.ser.forms[pronounId];
}

export function createVerbDrillQuestion(drillType = 'regular', pronounMode = 'all', options = {}) {
  const pronounFilter = DRILL_PRONOUN_MODES[pronounMode]?.filter || (() => true);
  const eligiblePronouns = PRONOUNS.filter(pronounFilter);
  const activePronouns = eligiblePronouns.length > 0 ? eligiblePronouns : PRONOUNS;

  if (drillType === 'serEstar') {
    const eligibleContexts = SER_ESTAR_CONTEXTS.filter((ctx) => activePronouns.some((p) => p.id === ctx.pronounId));
    const pool = eligibleContexts.length > 0 ? eligibleContexts : SER_ESTAR_CONTEXTS;
    const example = pool[getRandomInt(pool.length)];
    const pronoun = PRONOUNS.find((item) => item.id === example.pronounId) ?? PRONOUNS[0];
    const correctAnswer = IRREGULAR_VERBS[example.verb].forms[example.pronounId];
    const displayAnswer = example.sentence.replace('___', correctAnswer);

    return {
      id: `serEstar-${example.pronounId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      drillType,
      verb: 'ser / estar',
      prompt: example.sentence,
      instruction: 'Выберите ser или estar и напишите правильную форму',
      translation: example.translation,
      reason: example.reason,
      pronounId: example.pronounId,
      pronoun: pronoun.label,
      pronounAliases: pronoun.answerAliases,
      ending: null,
      correctAnswer,
      displayAnswer,
    };
  }

  if (drillType === 'fourKeyVerbs') {
    const selectedKey = FOUR_KEY_VERB_KEYS[getRandomInt(FOUR_KEY_VERB_KEYS.length)];
    const verb = IRREGULAR_VERBS[selectedKey];
    const pronoun = activePronouns[getRandomInt(activePronouns.length)];

    return {
      id: `${drillType}-${verb.infinitive}-${pronoun.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      drillType,
      subDrillType: selectedKey,
      verb: verb.infinitive,
      translation: verb.translation,
      pronounId: pronoun.id,
      pronoun: pronoun.label,
      pronounAliases: pronoun.answerAliases,
      ending: null,
      correctAnswer: conjugateVerb(selectedKey, verb, pronoun.id),
      pattern: verb.pattern,
      rulesHint: verb.hint,
    };
  }

  if (drillType === 'hacerDecir') {
    const keys = ['hacer', 'decir'];
    const selectedKey = keys[getRandomInt(keys.length)];
    const verb = IRREGULAR_VERBS[selectedKey];
    const pronoun = activePronouns[getRandomInt(activePronouns.length)];

    return {
      id: `${drillType}-${verb.infinitive}-${pronoun.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      drillType,
      subDrillType: selectedKey,
      verb: verb.infinitive,
      translation: verb.translation,
      pronounId: pronoun.id,
      pronoun: pronoun.label,
      pronounAliases: pronoun.answerAliases,
      ending: null,
      correctAnswer: conjugateVerb(selectedKey, verb, pronoun.id),
      pattern: verb.pattern,
      rulesHint: verb.hint,
    };
  }

  if (drillType === 'allIrregulars') {
    const selectedKey = ALL_IRREGULAR_KEYS[getRandomInt(ALL_IRREGULAR_KEYS.length)];
    const verb = IRREGULAR_VERBS[selectedKey];
    const pronoun = activePronouns[getRandomInt(activePronouns.length)];

    return {
      id: `${drillType}-${verb.infinitive}-${pronoun.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      drillType,
      subDrillType: selectedKey,
      verb: verb.infinitive,
      translation: verb.translation,
      pronounId: pronoun.id,
      pronoun: pronoun.label,
      pronounAliases: pronoun.answerAliases,
      ending: null,
      correctAnswer: conjugateVerb(selectedKey, verb, pronoun.id),
      pattern: verb.pattern,
      rulesHint: verb.hint,
    };
  }

  if (IRREGULAR_VERB_GROUPS[drillType]) {
    const groupVerbs = IRREGULAR_VERB_GROUPS[drillType].verbs;
    const selectedKey = groupVerbs[getRandomInt(groupVerbs.length)];
    const verb = IRREGULAR_VERBS[selectedKey];
    const pronoun = activePronouns[getRandomInt(activePronouns.length)];

    return {
      id: `${drillType}-${verb.infinitive}-${pronoun.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      drillType,
      subDrillType: selectedKey,
      verb: verb.infinitive,
      translation: verb.translation,
      pronounId: pronoun.id,
      pronoun: pronoun.label,
      pronounAliases: pronoun.answerAliases,
      ending: null,
      correctAnswer: conjugateVerb(selectedKey, verb, pronoun.id),
      pattern: verb.pattern,
      rulesHint: verb.hint,
    };
  }

  if (drillType === 'singleVerb' || IRREGULAR_VERBS[drillType]) {
    const key = (drillType === 'singleVerb' && options.singleVerb && IRREGULAR_VERBS[options.singleVerb])
      ? options.singleVerb
      : (IRREGULAR_VERBS[drillType] ? drillType : 'poder');
    const verb = IRREGULAR_VERBS[key];
    const pronoun = activePronouns[getRandomInt(activePronouns.length)];

    return {
      id: `single-${verb.infinitive}-${pronoun.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      drillType,
      subDrillType: key,
      verb: verb.infinitive,
      translation: verb.translation,
      pronounId: pronoun.id,
      pronoun: pronoun.label,
      pronounAliases: pronoun.answerAliases,
      ending: null,
      correctAnswer: conjugateVerb(key, verb, pronoun.id),
      pattern: verb.pattern,
      rulesHint: verb.hint,
    };
  }

  // regular
  const pronoun = activePronouns[getRandomInt(activePronouns.length)];
  const verb = REGULAR_VERBS[getRandomInt(REGULAR_VERBS.length)];

  return {
    id: `${drillType}-${verb.infinitive}-${pronoun.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    drillType,
    verb: verb.infinitive,
    translation: verb.translation,
    pronounId: pronoun.id,
    pronoun: pronoun.label,
    pronounAliases: pronoun.answerAliases,
    ending: verb.ending ?? null,
    correctAnswer: conjugateVerb(drillType, verb, pronoun.id),
  };
}

export function getVerbDrillProgressTopic(question) {
  if (question?.drillType === 'regular') {
    return question.ending === 'ar'
      ? 'Present tense regular -ar verbs'
      : 'Present tense regular -er/-ir verbs';
  }

  if (question?.drillType === 'fourKeyVerbs') {
    return question.subDrillType === 'tener'
      ? 'Tener (to have) and tener expressions'
      : question.subDrillType === 'ir'
      ? 'Present tense irregular verbs (ir/hacer/decir)'
      : 'Ser vs Estar (basic)';
  }

  if (question?.drillType === 'ser' || question?.drillType === 'estar' || question?.drillType === 'serEstar') {
    return 'Ser vs Estar (basic)';
  }

  if (question?.drillType === 'tener') {
    return 'Tener (to have) and tener expressions';
  }

  if (question?.drillType === 'hacerDecir' || question?.drillType === 'hacer' || question?.drillType === 'decir') {
    return 'Present tense irregular verbs (ir/hacer/decir)';
  }

  return DRILL_TYPES[question?.drillType]?.topic ?? 'Present tense irregular verbs (ir/hacer/decir)';
}

export function getVerbDrillAcceptedAnswers(question) {
  if (!question) return [];

  const rawCorrect = question.correctAnswer ?? '';
  const normalizedCorrect = normalizeAnswer(rawCorrect);
  const results = new Set([normalizedCorrect]);

  const rawAliases = question.pronounAliases ?? [];
  const normalizedAliases = rawAliases.map(normalizeAnswer).filter(Boolean);

  for (const alias of normalizedAliases) {
    results.add(`${alias} ${normalizedCorrect}`.trim());
  }

  if (question.prompt && question.prompt.includes('___')) {
    const fullSentence = question.prompt.replace('___', rawCorrect);
    results.add(normalizeAnswer(fullSentence));
  }

  return Array.from(results).filter(Boolean);
}

export function isVerbDrillAnswerCorrect(userAnswer, question) {
  if (!userAnswer) return false;

  const normalizedUser = normalizeAnswer(userAnswer);
  if (!normalizedUser) return false;

  if (typeof question === 'string') {
    return normalizedUser === normalizeAnswer(question);
  }

  const accepted = getVerbDrillAcceptedAnswers(question);
  return accepted.includes(normalizedUser);
}

export function getVerbDrillDisplayAnswer(question) {
  if (!question) return '';
  if (question.displayAnswer) return question.displayAnswer;
  const primaryPronoun = question.pronounAliases?.[0] ?? question.pronoun ?? '';
  return `${primaryPronoun} ${question.correctAnswer}`.trim();
}

export function isVerbDrillFinished(runModeOrStats, statsOrIndex) {
  let mode = 'infinite';
  let completed = 0;

  if (typeof runModeOrStats === 'string') {
    mode = runModeOrStats;
    completed = typeof statsOrIndex === 'number' ? statsOrIndex : statsOrIndex?.completed ?? 0;
  } else if (typeof runModeOrStats === 'object') {
    completed = runModeOrStats.completed ?? 0;
    mode = typeof statsOrIndex === 'string' ? statsOrIndex : 'infinite';
  }

  const limit = DRILL_RUN_MODES[mode]?.taskLimit;
  if (!limit) return false;
  return completed >= limit;
}
