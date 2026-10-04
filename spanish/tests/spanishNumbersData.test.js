import test from 'node:test';
import assert from 'node:assert/strict';
import {
  numberToSpanish,
  getSpanishNumberPhonetics,
  getSpanishNumberExplanation,
  ROUND_NUMBERS_10_TO_1000,
  MNEMONIC_CARTOONS,
  generateNumberQuestion
} from '../src/utils/spanishNumbersData.js';

test('Spanish numbers converter 1-1000', async (t) => {
  await t.test('converts units correctly', () => {
    assert.equal(numberToSpanish(0), 'cero');
    assert.equal(numberToSpanish(1), 'uno');
    assert.equal(numberToSpanish(5), 'cinco');
    assert.equal(numberToSpanish(9), 'nueve');
    assert.equal(numberToSpanish(10), 'diez');
    assert.equal(numberToSpanish(15), 'quince');
  });

  await t.test('converts 16-19 compound single words with accents', () => {
    assert.equal(numberToSpanish(16), 'dieciséis');
    assert.equal(numberToSpanish(17), 'diecisiete');
    assert.equal(numberToSpanish(18), 'dieciocho');
    assert.equal(numberToSpanish(19), 'diecinueve');
  });

  await t.test('converts 20-29 compound single words with accents', () => {
    assert.equal(numberToSpanish(20), 'veinte');
    assert.equal(numberToSpanish(21), 'veintiuno');
    assert.equal(numberToSpanish(22), 'veintidós');
    assert.equal(numberToSpanish(23), 'veintitrés');
    assert.equal(numberToSpanish(24), 'veinticuatro');
    assert.equal(numberToSpanish(25), 'veinticinco');
    assert.equal(numberToSpanish(26), 'veintiséis');
    assert.equal(numberToSpanish(27), 'veintisiete');
    assert.equal(numberToSpanish(28), 'veintiocho');
    assert.equal(numberToSpanish(29), 'veintinueve');
  });

  await t.test('converts 30-99 with "y"', () => {
    assert.equal(numberToSpanish(30), 'treinta');
    assert.equal(numberToSpanish(31), 'treinta y uno');
    assert.equal(numberToSpanish(40), 'cuarenta');
    assert.equal(numberToSpanish(50), 'cincuenta');
    assert.equal(numberToSpanish(55), 'cincuenta y cinco');
    assert.equal(numberToSpanish(60), 'sesenta');
    assert.equal(numberToSpanish(70), 'setenta');
    assert.equal(numberToSpanish(80), 'ochenta');
    assert.equal(numberToSpanish(90), 'noventa');
    assert.equal(numberToSpanish(99), 'noventa y nueve');
  });

  await t.test('converts hundreds, handling cien vs ciento and irregulars (500, 700, 900)', () => {
    assert.equal(numberToSpanish(100), 'cien');
    assert.equal(numberToSpanish(101), 'ciento uno');
    assert.equal(numberToSpanish(115), 'ciento quince');
    assert.equal(numberToSpanish(150), 'ciento cincuenta');
    assert.equal(numberToSpanish(200), 'doscientos');
    assert.equal(numberToSpanish(300), 'trescientos');
    assert.equal(numberToSpanish(400), 'cuatrocientos');
    assert.equal(numberToSpanish(500), 'quinientos'); // IRREGULAR!
    assert.equal(numberToSpanish(550), 'quinientos cincuenta');
    assert.equal(numberToSpanish(555), 'quinientos cincuenta y cinco');
    assert.equal(numberToSpanish(600), 'seiscientos');
    assert.equal(numberToSpanish(700), 'setecientos'); // IRREGULAR! (sete, not siete)
    assert.equal(numberToSpanish(777), 'setecientos setenta y siete');
    assert.equal(numberToSpanish(800), 'ochocientos');
    assert.equal(numberToSpanish(900), 'novecientos'); // IRREGULAR! (nove, not nueve)
    assert.equal(numberToSpanish(999), 'novecientos noventa y nueve');
    assert.equal(numberToSpanish(1000), 'mil');
  });
});

test('Round numbers list for Goda contains exactly the 19 requested round numbers', () => {
  assert.equal(ROUND_NUMBERS_10_TO_1000.length, 19);
  assert.deepEqual(ROUND_NUMBERS_10_TO_1000, [
    10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
    200, 300, 400, 500, 600, 700, 800, 900, 1000
  ]);
});

test('Mnemonic cartoons for 50 and 500 metadata', () => {
  assert.ok(MNEMONIC_CARTOONS['50']);
  assert.equal(MNEMONIC_CARTOONS['50'].number, 50);
  assert.equal(MNEMONIC_CARTOONS['50'].word, 'cincuenta');
  assert.ok(MNEMONIC_CARTOONS['50'].url.includes('cincuenta-centauro.html'));

  assert.ok(MNEMONIC_CARTOONS['500']);
  assert.equal(MNEMONIC_CARTOONS['500'].number, 500);
  assert.equal(MNEMONIC_CARTOONS['500'].word, 'quinientos');
  assert.ok(MNEMONIC_CARTOONS['500'].url.includes('quinientos-entos.html'));
});

test('Question generator produces 4 options and identifies cartoons', () => {
  const q50 = generateNumberQuestion('cartoons', 'number_to_word', 50);
  assert.equal(q50.targetNum, 50);
  assert.equal(q50.correctAnswer, 'cincuenta');
  assert.equal(q50.hasCartoon, true);
  assert.equal(q50.cartoonId, '50');
  assert.equal(q50.options.length, 4);
  assert.ok(q50.options.includes('cincuenta'));

  const q500 = generateNumberQuestion('cartoons', 'number_to_word', 500);
  assert.equal(q500.targetNum, 500);
  assert.equal(q500.correctAnswer, 'quinientos');
  assert.equal(q500.hasCartoon, true);
  assert.equal(q500.cartoonId, '500');
  assert.equal(q500.options.length, 4);
  assert.ok(q500.options.includes('quinientos'));
});
