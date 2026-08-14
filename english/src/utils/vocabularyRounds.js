export function shuffleVocabulary(words, random = Math.random) {
  const copy = [...words];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function buildVocabularyRound(words, mode, dueWords = [], random = Math.random) {
  const active = words.filter((word) => !word.learned_permanently_at);
  const source = mode === 'due'
    ? dueWords.filter((word) => !word.learned_permanently_at)
    : mode === 'favorites'
      ? active.filter((word) => Boolean(word.is_favorite))
      : active;
  const uniqueById = Array.from(new Map(source.map((word) => [word.id, word])).values());
  return shuffleVocabulary(uniqueById, random);
}
