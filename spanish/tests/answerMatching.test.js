import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAnswer,
  scoreTypedAnswer,
  splitAnswerAlternatives,
  stripDiacritics,
} from '../src/utils/answerMatching.js';

describe('answer matching helpers', () => {
  it('strips diacritics and lowercases the input', () => {
    assert.equal(stripDiacritics('Canción'), 'Cancion');
    assert.equal(normalizeAnswer('  ¡Canción!  '), 'cancion');
  });

  it('collapses punctuation and whitespace consistently', () => {
    assert.equal(normalizeAnswer('Hola, ¿qué tal?'), 'hola que tal');
    assert.equal(normalizeAnswer('under-standing'), 'under standing');
  });

  it('splits multiple acceptable answers', () => {
    assert.deepEqual(splitAnswerAlternatives('hola/hi | hello'), ['hola', 'hi', 'hello']);
    assert.deepEqual(splitAnswerAlternatives('solo una'), ['solo una']);
  });

  it('treats exact matches as correct', () => {
    const result = scoreTypedAnswer('cancion', 'canción');
    assert.equal(result.status, 'correct');
    assert.equal(result.grade, 'good');
    assert.equal(result.distance, 0);
  });

  it('ignores typographic apostrophes while typing', () => {
    const result = scoreTypedAnswer('l enfant', 'l’enfant');
    assert.equal(result.status, 'correct');
    assert.equal(result.grade, 'good');
  });

  it('does not fail on n versus enye or dieresis differences', () => {
    assert.equal(scoreTypedAnswer('ano', 'año').status, 'correct');
    assert.equal(scoreTypedAnswer('pinguino', 'pingüino').status, 'correct');
  });

  it('treats tiny typos as close (hard grade)', () => {
    const result = scoreTypedAnswer('cancin', 'canción');
    assert.equal(result.status, 'close');
    assert.equal(result.grade, 'hard');
    assert.ok(result.distance > 0 && result.distance <= 2);
  });

  it('is a bit more tolerant for longer Spanish answers', () => {
    const result = scoreTypedAnswer('biblioteka', 'biblioteca');
    assert.equal(result.status, 'close');
    assert.equal(result.grade, 'hard');
  });

  it('flags unrelated input as wrong (dont_know grade)', () => {
    const result = scoreTypedAnswer('perro', 'gato');
    assert.equal(result.status, 'wrong');
    assert.equal(result.grade, 'dont_know');
  });

  it('is lenient to short synonyms via alternatives', () => {
    const result = scoreTypedAnswer('hi', 'hola / hi');
    assert.equal(result.status, 'correct');
  });

  it('does not accept a one-letter typo for very short words', () => {
    const result = scoreTypedAnswer('si', 'no');
    assert.equal(result.status, 'wrong');
  });

  it('returns an empty result for blank input', () => {
    const result = scoreTypedAnswer('   ', 'hola');
    assert.equal(result.status, 'empty');
    assert.equal(result.grade, null);
  });

  it('matches Spanish words with or without leading articles (el, la, etc.)', () => {
    assert.equal(scoreTypedAnswer('papa', 'el papá').status, 'correct');
    assert.equal(scoreTypedAnswer('el papa', 'papá').status, 'correct');
    assert.equal(scoreTypedAnswer('manzana', 'la manzana').status, 'correct');
    assert.equal(scoreTypedAnswer('el agua', 'agua').status, 'correct');
  });

  it('matches Russian translations with parenthetical explanations', () => {
    assert.equal(scoreTypedAnswer('альфахор', 'альфахор (аргентинское печенье)').status, 'correct');
    assert.equal(scoreTypedAnswer('аргентинское печенье', 'альфахор (аргентинское печенье)').status, 'correct');
    assert.equal(scoreTypedAnswer('медиалуна', 'медиалуна (круассан)').status, 'correct');
    assert.equal(scoreTypedAnswer('круассан', 'медиалуна (круассан)').status, 'correct');
  });

  it('matches Russian synonyms separated by slashes or commas', () => {
    assert.equal(scoreTypedAnswer('кот', 'кот / кошка').status, 'correct');
    assert.equal(scoreTypedAnswer('кошка', 'кот / кошка').status, 'correct');
    assert.equal(scoreTypedAnswer('здравствуй', 'привет / здравствуй').status, 'correct');
  });

  it('tolerates Russian ё vs е variations', () => {
    assert.equal(scoreTypedAnswer('желтый', 'жёлтый').status, 'correct');
    assert.equal(scoreTypedAnswer('зеленый', 'зелёный').status, 'correct');
  });
});
