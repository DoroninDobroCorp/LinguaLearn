const SPANISH_LOCALE = 'es';

export function buildUnicodeCaseFoldKey(value, locale = SPANISH_LOCALE) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.normalize('NFC').toLocaleLowerCase(locale);
}

export function buildProfileNameKey(name) {
  return buildUnicodeCaseFoldKey(name);
}

export function buildVocabularyTextKey(value) {
  return buildUnicodeCaseFoldKey(value);
}

export function buildVocabularyExactDuplicateKey(word, translation) {
  return `${buildVocabularyTextKey(word)}\u0000${buildVocabularyTextKey(translation)}`;
}
