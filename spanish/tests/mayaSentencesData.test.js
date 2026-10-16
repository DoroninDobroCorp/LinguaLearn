import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXERCISES_ES_TO_RU,
  EXERCISES_RU_TO_ES,
  MAYA_REGULAR_VERBS_LIST,
  getExercise,
  isMayaSentenceAnswerCorrect,
  generateWordTilesForSentence,
} from '../src/utils/mayaSentencesData.js';

describe('Maya Regular Verbs Practice Dataset', () => {
  it('contains exactly 5 exercises of 20 sentences for ES -> RU', () => {
    assert.equal(EXERCISES_ES_TO_RU.length, 5);
    let total = 0;
    for (const ex of EXERCISES_ES_TO_RU) {
      assert.equal(ex.sentences.length, 20, `Exercise ${ex.id} must have 20 sentences`);
      total += ex.sentences.length;
    }
    assert.equal(total, 100);
  });

  it('contains exactly 5 exercises of 20 sentences for RU -> ES', () => {
    assert.equal(EXERCISES_RU_TO_ES.length, 5);
    let total = 0;
    for (const ex of EXERCISES_RU_TO_ES) {
      assert.equal(ex.sentences.length, 20, `Exercise ${ex.id} must have 20 sentences`);
      total += ex.sentences.length;
    }
    assert.equal(total, 100);
  });

  it('guarantees that all 200 sentences are completely unique across both languages', () => {
    const spanishSet = new Set();
    const russianSet = new Set();
    const idSet = new Set();

    for (const ex of EXERCISES_ES_TO_RU) {
      for (const s of ex.sentences) {
        assert.ok(!idSet.has(s.id), `Duplicate ID: ${s.id}`);
        idSet.add(s.id);
        const normEs = s.spanish.toLowerCase().trim();
        const normRu = s.russian.toLowerCase().trim();
        assert.ok(!spanishSet.has(normEs), `Duplicate Spanish sentence: ${s.spanish}`);
        assert.ok(!russianSet.has(normRu), `Duplicate Russian sentence: ${s.russian}`);
        spanishSet.add(normEs);
        russianSet.add(normRu);
      }
    }

    for (const ex of EXERCISES_RU_TO_ES) {
      for (const s of ex.sentences) {
        assert.ok(!idSet.has(s.id), `Duplicate ID: ${s.id}`);
        idSet.add(s.id);
        const normEs = s.spanish.toLowerCase().trim();
        const normRu = s.russian.toLowerCase().trim();
        assert.ok(!spanishSet.has(normEs), `Duplicate Spanish sentence: ${s.spanish}`);
        assert.ok(!russianSet.has(normRu), `Duplicate Russian sentence: ${s.russian}`);
        spanishSet.add(normEs);
        russianSet.add(normRu);
      }
    }

    assert.equal(spanishSet.size, 200);
    assert.equal(russianSet.size, 200);
    assert.equal(idSet.size, 200);
  });

  it('focuses on regular verbs from Maya deck', () => {
    assert.deepEqual(MAYA_REGULAR_VERBS_LIST.sort(), [
      'ayudar', 'comer', 'comprar', 'correr', 'dibujar',
      'escuchar', 'esperar', 'mirar', 'pintar', 'saltar'
    ].sort());

    for (const ex of [...EXERCISES_ES_TO_RU, ...EXERCISES_RU_TO_ES]) {
      for (const s of ex.sentences) {
        assert.ok(s.verb, `Missing verb in sentence ${s.id}`);
        assert.ok(s.verbForm, `Missing verbForm in sentence ${s.id}`);
        assert.ok(s.verbPerson, `Missing verbPerson in sentence ${s.id}`);
      }
    }
  });

  it('allows selecting each exercise separately via getExercise', () => {
    for (let i = 1; i <= 5; i++) {
      const exEsRu = getExercise('es_to_ru', i);
      assert.equal(exEsRu.id, i);
      assert.equal(exEsRu.sentences.length, 20);

      const exRuEs = getExercise('ru_to_es', i);
      assert.equal(exRuEs.id, i);
      assert.equal(exRuEs.sentences.length, 20);
    }
  });

  it('verifies student answers flexibly (accents, punctuation, case, vos/tú)', () => {
    const s1 = EXERCISES_ES_TO_RU[0].sentences[0]; // "Yo dibujo una casa linda con el lápiz negro." -> "Я рисую красивый дом чёрным карандашом."
    assert.equal(isMayaSentenceAnswerCorrect('Я рисую красивый дом чёрным карандашом.', s1), true);
    assert.equal(isMayaSentenceAnswerCorrect('я рисую красивый дом черным карандашом', s1), true);
    assert.equal(isMayaSentenceAnswerCorrect('Я рисую красивый домик чёрным карандашом', s1), true);
    assert.equal(isMayaSentenceAnswerCorrect('я ем суп', s1), false);

    const s2 = EXERCISES_RU_TO_ES[0].sentences[1]; // "Ты рисуешь белого кота в книге." -> "Vos dibujás un gato blanco en el libro."
    assert.equal(isMayaSentenceAnswerCorrect('Vos dibujás un gato blanco en el libro', s2), true);
    assert.equal(isMayaSentenceAnswerCorrect('vos dibujas un gato blanco en el libro', s2), true);
    assert.equal(isMayaSentenceAnswerCorrect('Tú dibujas un gato blanco en el libro', s2), true);
    assert.equal(isMayaSentenceAnswerCorrect('dibujás un gato blanco en el libro', s2), true);
  });

  it('generates clickable word tiles with distractors', () => {
    const sentence = EXERCISES_ES_TO_RU[0].sentences[0];
    const tiles = generateWordTilesForSentence(sentence, 'es_to_ru');
    assert.ok(tiles.length >= 6);
    assert.ok(tiles.some((t) => t.text === 'Я'));
    assert.ok(tiles.some((t) => t.text === 'рисую'));
  });
});
