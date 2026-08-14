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

export function restoreVocabularyRound(words, saved) {
  if (!saved || !['once_all', 'favorites'].includes(saved.mode) || !Array.isArray(saved.queueIds) || !Number.isSafeInteger(saved.roundTotal)) {
    return null;
  }
  const wordById = new Map(words.map((word) => [Number(word.id), word]));
  const queue = saved.queueIds
    .map((id) => wordById.get(Number(id)))
    .filter((word) => word && !word.learned_permanently_at && (saved.mode !== 'favorites' || word.is_favorite));
  return { mode: saved.mode, queue, roundTotal: Math.max(saved.roundTotal, queue.length) };
}
