export function shuffleVocabulary(words, random = Math.random) {
  const copy = [...words];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function isResumableVocabularyMode(mode) {
  return mode === 'once_all' || mode === 'favorites' || (typeof mode === 'string' && (mode.startsWith('group:') || mode.startsWith('groups:')));
}

export function buildVocabularyRound(words, mode, dueWords = [], random = Math.random) {
  const active = words.filter((word) => !word.learned_permanently_at);
  const isSingleGroup = typeof mode === 'string' && mode.startsWith('group:');
  const isMultiGroup = typeof mode === 'string' && mode.startsWith('groups:');
  const isGroup = isSingleGroup || isMultiGroup;
  const targetGroupIds = isSingleGroup
    ? [Number(mode.split(':')[1])]
    : isMultiGroup
    ? mode.split(':')[1].split(',').map(Number).filter(Boolean)
    : [];

  const source = mode === 'due'
    ? dueWords.filter((word) => !word.learned_permanently_at)
    : mode === 'favorites'
      ? active.filter((word) => Boolean(word.is_favorite))
      : isGroup && targetGroupIds.length > 0
        ? active.filter((word) => {
            const gids = (word.group_ids || []).concat((word.groups || []).map((g) => g.id));
            return targetGroupIds.some((id) => gids.includes(id));
          })
        : active;
  const uniqueById = Array.from(new Map(source.map((word) => [word.id, word])).values());
  return shuffleVocabulary(uniqueById, random);
}

export function restoreVocabularyRound(words, saved) {
  if (!saved || !isResumableVocabularyMode(saved.mode) || !Array.isArray(saved.queueIds) || !Number.isSafeInteger(saved.roundTotal)) {
    return null;
  }
  const isSingleGroup = typeof saved.mode === 'string' && saved.mode.startsWith('group:');
  const isMultiGroup = typeof saved.mode === 'string' && saved.mode.startsWith('groups:');
  const isGroup = isSingleGroup || isMultiGroup;
  const targetGroupIds = isSingleGroup
    ? [Number(saved.mode.split(':')[1])]
    : isMultiGroup
    ? saved.mode.split(':')[1].split(',').map(Number).filter(Boolean)
    : [];
  const wordById = new Map(words.map((word) => [Number(word.id), word]));
  const queue = saved.queueIds
    .map((id) => wordById.get(Number(id)))
    .filter((word) => {
      if (!word || word.learned_permanently_at) return false;
      if (saved.mode === 'favorites' && !word.is_favorite) return false;
      if (isGroup && targetGroupIds.length > 0) {
        const gids = (word.group_ids || []).concat((word.groups || []).map((g) => g.id));
        if (!targetGroupIds.some((id) => gids.includes(id))) return false;
      }
      return true;
    });
  return { mode: saved.mode, queue, roundTotal: Math.max(saved.roundTotal, queue.length) };
}
