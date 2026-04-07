import { findTag } from '../../lib/tagParser.js';

/**
 * Parse an [EXERCISE: {...}] tag from message text.
 *
 * Delegates to the shared string-aware tag parser so that `}]` sequences
 * inside JSON string values are handled correctly.
 *
 * @param {string} text - message content that may contain an EXERCISE tag
 * @returns {{ exercise: object, cleanContent: string } | null}
 */
export function parseExerciseTag(text) {
  const prefix = '[EXERCISE: ';
  const loc = findTag(text, prefix);
  if (!loc) return null;

  try {
    const exercise = JSON.parse(text.substring(loc.jsonStart, loc.jsonEnd));
    const cleanContent = (text.slice(0, loc.tagStart) + text.slice(loc.tagEnd)).trim();
    return { exercise, cleanContent };
  } catch (e) {
    console.error('Error parsing exercise JSON:', e);
    return null;
  }
}
