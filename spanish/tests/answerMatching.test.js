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

  it('treats tiny typos as close (hard grade)', () => {
    const result = scoreTypedAnswer('cancin', 'canción');
    assert.equal(result.status, 'close');
    assert.equal(result.grade, 'hard');
    assert.ok(result.distance > 0 && result.distance <= 2);
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
});
