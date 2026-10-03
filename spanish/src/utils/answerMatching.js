// Lightweight helpers for the "type the answer" review mode.
// Kept plain and side-effect free so they can be exercised from node:test.

const PUNCTUATION_PATTERN = /[.,;:!?¡¿"'‘’ʼ`´()[\]{}«»—–\-_/\\]+/g;

function collapseSpanishLetterVariants(value = '') {
  return String(value)
    .replace(/ñ/g, 'n')
    .replace(/ü/g, 'u');
}

export function stripDiacritics(value = '') {
  // Separate characters from combining marks so accents can be dropped cleanly.
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function stripArticle(str = '') {
  return String(str || '').replace(/^(el|la|los|las|un|una|unos|unas)\s+/i, '').trim();
}

export function normalizeAnswer(value = '') {
  const lowered = String(value).toLowerCase();
  const simplifiedLetters = collapseSpanishLetterVariants(lowered);
  const withoutDiacritics = stripDiacritics(simplifiedLetters);
  return withoutDiacritics
    .replace(PUNCTUATION_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitAnswerAlternatives(value = '') {
  // Allow multiple acceptable answers separated by "/", "|", ";" or ",".
  const rawParts = String(value)
    .split(/[/|;,]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const results = new Set();
  for (const part of rawParts) {
    results.add(part);

    // If part has parenthetical text like "альфахор (аргентинское печенье)"
    if (part.includes('(') && part.includes(')')) {
      // 1. Text without parentheses: "альфахор"
      const withoutParen = part.replace(/\([^)]*\)/g, '').trim();
      if (withoutParen) results.add(withoutParen);

      // 2. Text inside parentheses: "аргентинское печенье"
      const matches = part.match(/\(([^)]+)\)/g);
      if (matches) {
        for (const m of matches) {
          const inside = m.replace(/[()]/g, '').trim();
          if (inside && inside.length > 1 && !['m', 'f', 'v', 'adj', 'adv', 'n'].includes(inside.toLowerCase())) {
            results.add(inside);
          }
        }
      }
    }
  }

  // Also for Spanish answers with leading articles, add a version without article
  const expanded = new Set(results);
  for (const item of results) {
    const withoutArt = stripArticle(item);
    if (withoutArt && withoutArt !== item) {
      expanded.add(withoutArt);
    }
  }

  return Array.from(expanded);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array(b.length + 1);
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }
    previous = current;
  }

  return previous[b.length];
}

function closeThresholdFor(length) {
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  if (length <= 10) return 2;
  return 3;
}

export function scoreTypedAnswer(typed, expected) {
  const normalizedTyped = normalizeAnswer(typed);
  const expectedRaw = String(expected || '').trim();

  if (!normalizedTyped) {
    return { status: 'empty', grade: null, normalizedTyped, normalizedExpected: normalizeAnswer(expectedRaw) };
  }

  const alternatives = splitAnswerAlternatives(expectedRaw);
  const candidates = alternatives.length > 0 ? alternatives : [expectedRaw];

  let bestDistance = Number.POSITIVE_INFINITY;
  let bestNormalizedExpected = normalizeAnswer(expectedRaw);

  const normalizedTypedVariants = [
    normalizedTyped,
    stripArticle(normalizedTyped),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeAnswer(candidate);
    if (!normalizedCandidate) {
      continue;
    }

    const candidateVariants = [
      normalizedCandidate,
      stripArticle(normalizedCandidate),
    ].filter(Boolean);

    for (const tVar of normalizedTypedVariants) {
      for (const cVar of candidateVariants) {
        const distance = levenshtein(tVar, cVar);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestNormalizedExpected = normalizedCandidate;
        }
      }
    }
  }

  if (!Number.isFinite(bestDistance)) {
    return {
      status: 'wrong',
      grade: 'dont_know',
      normalizedTyped,
      normalizedExpected: bestNormalizedExpected,
      distance: null,
    };
  }

  if (bestDistance === 0) {
    return {
      status: 'correct',
      grade: 'good',
      normalizedTyped,
      normalizedExpected: bestNormalizedExpected,
      distance: 0,
    };
  }

  const threshold = closeThresholdFor(bestNormalizedExpected.length || normalizedTyped.length);
  if (bestDistance <= threshold) {
    return {
      status: 'close',
      grade: 'hard',
      normalizedTyped,
      normalizedExpected: bestNormalizedExpected,
      distance: bestDistance,
    };
  }

  return {
    status: 'wrong',
    grade: 'dont_know',
    normalizedTyped,
    normalizedExpected: bestNormalizedExpected,
    distance: bestDistance,
  };
}
