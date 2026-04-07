/**
 * Shared string-aware tag parser for [PREFIX: {...}] tags.
 *
 * Handles JSON string values that contain `}`, `]`, `}]`, escaped quotes,
 * and nested objects/arrays — cases where naive brace counting breaks.
 *
 * Used by both the Express server and the React client.
 */

/**
 * Locate the boundaries of a single [PREFIX: {...}] tag in `text`.
 *
 * Uses string-aware brace counting so that `}` or `}]` inside JSON
 * string values are ignored.
 *
 * @param {string} text       Full text to search.
 * @param {string} tagPrefix  Opening marker including the trailing space,
 *                             e.g. `'[EXERCISE: '`.
 * @param {number} [searchFrom=0]  Index to start searching from.
 * @returns {{ tagStart: number, jsonStart: number, jsonEnd: number, tagEnd: number } | null}
 *   tagStart  – index of the `[` in `[PREFIX: `
 *   jsonStart – index of the first `{`
 *   jsonEnd   – index *after* the matching `}`
 *   tagEnd    – index *after* the closing `]` (or jsonEnd if no `]` found)
 */
export function findTag(text, tagPrefix, searchFrom = 0) {
  const tagStart = text.indexOf(tagPrefix, searchFrom);
  if (tagStart === -1) return null;

  const jsonStart = tagStart + tagPrefix.length;

  let braceCount = 0;
  let inString = false;
  let escape = false;
  let jsonEnd = -1;

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

    if (ch === '{') {
      braceCount++;
    } else if (ch === '}') {
      braceCount--;
      if (braceCount === 0) {
        jsonEnd = i + 1;
        break;
      }
    }
  }

  if (jsonEnd === -1) return null;

  // Advance past optional closing ']', but only skip whitespace — never
  // scan past non-whitespace characters that aren't ']'.  This prevents a
  // missing ']' from consuming unrelated text.
  let tagEnd = jsonEnd;
  while (tagEnd < text.length && text[tagEnd] !== ']' && /\s/.test(text[tagEnd])) tagEnd++;
  if (tagEnd < text.length && text[tagEnd] === ']') tagEnd++; // include the ']'

  return { tagStart, jsonStart, jsonEnd, tagEnd };
}

/**
 * Extract and JSON.parse every occurrence of `[tagPrefix {...}]` in `text`.
 *
 * Unparseable payloads are silently skipped (logged to console.error).
 *
 * @param {string} text
 * @param {string} tagPrefix
 * @returns {object[]}  Array of parsed JSON payloads.
 */
export function extractAllTags(text, tagPrefix) {
  const results = [];
  let searchFrom = 0;

  while (true) {
    const loc = findTag(text, tagPrefix, searchFrom);
    if (!loc) break;

    try {
      results.push(JSON.parse(text.substring(loc.jsonStart, loc.jsonEnd)));
    } catch (e) {
      console.error(`Error parsing ${tagPrefix.trim()} JSON:`, e);
    }

    searchFrom = loc.jsonEnd;
  }

  return results;
}

/**
 * Extract and JSON.parse the first occurrence of `[tagPrefix {...}]`.
 *
 * @param {string} text
 * @param {string} tagPrefix
 * @returns {object | null}
 */
export function extractFirstTag(text, tagPrefix) {
  const loc = findTag(text, tagPrefix);
  if (!loc) return null;

  try {
    return JSON.parse(text.substring(loc.jsonStart, loc.jsonEnd));
  } catch (e) {
    console.error(`Error parsing ${tagPrefix.trim()} JSON:`, e);
    return null;
  }
}

/**
 * Remove every `[tagPrefix {...}]` occurrence from `text`.
 *
 * @param {string} text
 * @param {string} tagPrefix
 * @returns {string}
 */
export function stripTags(text, tagPrefix) {
  let result = text;
  // Re-search from the start each iteration because indices shift after splicing.
  let loc;
  while ((loc = findTag(result, tagPrefix)) !== null) {
    result = result.slice(0, loc.tagStart) + result.slice(loc.tagEnd);
  }
  return result;
}
