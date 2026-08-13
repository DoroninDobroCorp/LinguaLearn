import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterWritingCandidate } from '../server/writingAnalysis.js';

describe('English Candidate Filter False Rejection Fix (VAL-HEURISTIC-002)', () => {
  it('accepts common English sentences containing "let me", "class", "import", "function"', () => {
    const testCases = [
      'Please let me know if you have any further questions.',
      'Let me know when you are ready.',
      'Let us discuss this tomorrow.',
      'This class is useful.',
      'We import goods from Italy.',
      'The function of this button is clear.',
      'Let me know what works best for your schedule.',
      'I have a class at 3 PM tomorrow.',
      'What is the main function of this software?',
      'They import coffee and fruit from South America.',
      'Please let me know your decision by end of day.',
      'Let us meet at the office around noon.',
      'Taking this English class has improved my grammar.',
      'The country will import more natural gas this winter.',
      'The primary function of an error guard is isolation.',
    ];

    for (const text of testCases) {
      const result = filterWritingCandidate(text);
      assert.equal(
        result.accepted,
        true,
        `Expected candidate filter to accept valid English sentence "${text}", but got rejected with reason "${result.reason}"`
      );
      assert.equal(result.reason, null);
    }
  });

  it('rejects strong code signals requiring operators, braces, semicolons, function syntax, or code fences', () => {
    const codeCases = [
      { text: 'const x = 42;', expectedReason: 'code_signal' },
      { text: 'let count = 0;', expectedReason: 'code_signal' },
      { text: 'var message = "hello";', expectedReason: 'code_signal' },
      { text: 'function handleInput(e) {', expectedReason: 'code_signal' },
      { text: 'class UserComponent extends Component {', expectedReason: 'code_signal' },
      { text: 'import { useState } from "react";', expectedReason: 'code_signal' },
      { text: 'import React from "react";', expectedReason: 'code_signal' },
      { text: 'const fn = (a, b) => a + b;', expectedReason: 'code_signal' },
      { text: 'if (x === y) {', expectedReason: 'code_signal' },
      { text: 'SELECT * FROM users WHERE active = true;', expectedReason: 'code_signal' },
      { text: '```js\nconsole.log("test");\n```', expectedReason: 'code_signal' },
      { text: 'x++;', expectedReason: 'code_signal' },
      { text: 'x += 10;', expectedReason: 'code_signal' },
      { text: 'return a !== b;', expectedReason: 'code_signal' },
    ];

    for (const { text, expectedReason } of codeCases) {
      const result = filterWritingCandidate(text);
      assert.equal(
        result.accepted,
        false,
        `Expected candidate filter to reject code "${text}", but got accepted=true`
      );
      assert.equal(
        result.reason,
        expectedReason,
        `Expected rejection reason "${expectedReason}" for code "${text}", got "${result.reason}"`
      );
    }
  });
});
