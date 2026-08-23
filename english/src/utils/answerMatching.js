// Lightweight helpers for the English "type the answer" and sentence matching.

const PUNCTUATION_PATTERN = /[.,;:!?¡¿"'‘’ʼ`´()[\]{}«»—–\-_/\\]+/g;

const CONTRACTIONS = {
  "don't": "do not",
  "doesn't": "does not",
  "didn't": "did not",
  "won't": "will not",
  "wouldn't": "would not",
  "can't": "cannot",
  "couldn't": "could not",
  "shouldn't": "should not",
  "haven't": "have not",
  "hasn't": "has not",
  "hadn't": "had not",
  "isn't": "is not",
  "aren't": "are not",
  "wasn't": "was not",
  "weren't": "were not",
  "i'm": "i am",
  "you're": "you are",
  "he's": "he is",
  "she's": "she is",
  "it's": "it is",
  "we're": "we are",
  "they're": "they are",
  "i've": "i have",
  "you've": "you have",
  "we've": "we have",
  "they've": "they have",
  "i'll": "i will",
  "you'll": "you will",
  "he'll": "he will",
  "she'll": "she will",
  "we'll": "we will",
  "they'll": "they will",
  "i'd": "i would",
  "you'd": "you would",
  "he'd": "he would",
  "she'd": "she would",
  "we'd": "we would",
  "they'd": "they would"
};

export function normalizeAnswer(value = '') {
  let lowered = String(value).toLowerCase().trim();
  for (const [contr, exp] of Object.entries(CONTRACTIONS)) {
    const reg = new RegExp(`\\b${contr}\\b`, 'g');
    lowered = lowered.replace(reg, exp);
  }
  return lowered
    .replace(PUNCTUATION_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitAnswerAlternatives(value = '') {
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

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeAnswer(candidate);
    if (!normalizedCandidate) continue;
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

export function checkAnswerMatch(userText, correctText, altAnswers = []) {
  const normUser = normalizeAnswer(userText);
  const normCorrect = normalizeAnswer(correctText);
  if (normUser === normCorrect) return true;

  if (Array.isArray(altAnswers)) {
    for (const alt of altAnswers) {
      if (normalizeAnswer(alt) === normUser) return true;
    }
  }

  return false;
}
