// Lightweight helpers for the "type the answer" review mode.
// Kept plain and side-effect free so they can be exercised from node:test.

const PUNCTUATION_PATTERN = /[.,;:!?¡¿"'‘’ʼ`´()[\]{}«»—–\-_/\\]+/g;

export function stripDiacritics(value = '') {
  // Separate characters from combining marks so accents can be dropped cleanly.
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeAnswer(value = '') {
  const withoutDiacritics = stripDiacritics(String(value).toLowerCase());
  return withoutDiacritics
    .replace(PUNCTUATION_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitAnswerAlternatives(value = '') {
  // Allow multiple acceptable answers separated by "/", "|" or ";".
  return String(value)
    .split(/[/|;]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
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
  return 2;
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

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeAnswer(candidate);
    if (!normalizedCandidate) {
      continue;
    }
    const distance = levenshtein(normalizedTyped, normalizedCandidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestNormalizedExpected = normalizedCandidate;
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
