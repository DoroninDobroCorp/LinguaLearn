/**
 * Balanced-brace parser for [EXERCISE: {...}] tags.
 * Unlike the previous regex approach, this correctly handles `}]` sequences
 * that appear inside JSON string values (e.g. in question text).
 *
 * @param {string} text - message content that may contain an EXERCISE tag
 * @returns {{ exercise: object, cleanContent: string } | null}
 */
export function parseExerciseTag(text) {
  const prefix = '[EXERCISE: ';
  const tagIndex = text.indexOf(prefix);
  if (tagIndex === -1) return null;

  const jsonStart = tagIndex + prefix.length;
  let braceCount = 0;
  let jsonEnd = -1;
  let inString = false;
  let escape = false;

  for (let i = jsonStart; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') braceCount++;
    else if (ch === '}') {
      braceCount--;
      if (braceCount === 0) {
        jsonEnd = i + 1;
        break;
      }
    }
  }

  if (jsonEnd === -1) return null;

  // Advance past the closing ']'
  let tagEnd = jsonEnd;
  while (tagEnd < text.length && text[tagEnd] !== ']') tagEnd++;
  if (tagEnd < text.length) tagEnd++; // include ']'

  try {
    const exercise = JSON.parse(text.substring(jsonStart, jsonEnd));
    const cleanContent = (text.slice(0, tagIndex) + text.slice(tagEnd)).trim();
    return { exercise, cleanContent };
  } catch (e) {
    console.error('Error parsing exercise JSON:', e);
    return null;
  }
}
