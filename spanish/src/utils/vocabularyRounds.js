export function buildOnceEachChoices(entries, getVariants, random = Math.random) {
  const uniqueEntries = Array.from(new Map(entries.map((entry) => [entry.id, entry])).values());
  return uniqueEntries.flatMap((entry) => {
    const variants = getVariants(entry) || [];
    if (variants.length === 0) return [];
    const index = Math.floor(random() * variants.length);
    return [{ entry, variant: variants[index] || variants[0] }];
  });
}

export function isReviewMistake(grade) {
  return grade === 'dont_know' || grade === 'again' || grade === 1 || grade === 'hard';
}

export function isEntryBlocked(entry) {
  return Array.isArray(entry?.cards) && entry.cards.every((card) => !card.is_reviewable);
}

export function isEntryEligibleForRandomStudy(entry) {
  return !entry?.learned_permanently_at && !isEntryBlocked(entry)
    && Array.isArray(entry?.cards)
    && entry.cards.some((card) => card.is_reviewable && card.is_due);
}

export function isEntryEligibleForLearnedStudy(entry) {
  return !isEntryBlocked(entry)
    && Array.isArray(entry?.cards)
    && entry.cards.some((card) => card.is_reviewable)
    && (Boolean(entry?.learned_permanently_at) || entry.cards.every((card) => card.status === 'learned'));
}

export function isEntryEligibleForPracticeAll(entry) {
  return !entry?.learned_permanently_at && !isEntryBlocked(entry)
    && Array.isArray(entry?.cards)
    && entry.cards.some((card) => card.is_reviewable)
    && !entry.cards.every((card) => card.status === 'learned');
}

export function chooseRandomItem(values = [], random = Math.random) {
  if (!values || values.length === 0) {
    return null;
  }
  return values[Math.floor(random() * values.length)] || values[0];
}

export function pickNextSessionCard(sessionEntries, sessionMode = 'due', previousEntryId = null, random = Math.random) {
  const activeEntries = sessionEntries.filter((entry) => entry.remainingVariants && entry.remainingVariants.length > 0);
  if (activeEntries.length === 0) {
    return null;
  }

  const prevId = previousEntryId != null ? Number(previousEntryId) : null;
  const candidateEntries = activeEntries.length > 1 && prevId != null
    ? activeEntries.filter((entry) => Number(entry.entryId) !== prevId)
    : activeEntries;
  const selectedEntry = chooseRandomItem(candidateEntries.length > 0 ? candidateEntries : activeEntries, random);
  const selectedVariant = chooseRandomItem(selectedEntry?.remainingVariants || [], random);

  if (!selectedEntry || !selectedVariant) {
    return null;
  }

  return {
    entryId: selectedEntry.entryId,
    card: {
      id: selectedEntry.entryId,
      entry_id: selectedEntry.entryId,
      word: selectedEntry.word,
      translation: selectedEntry.translation,
      example: selectedEntry.example,
      is_favorite: selectedEntry.isFavorite,
      groups: selectedEntry.groups || [],
      group_ids: selectedEntry.group_ids || [],
      due_card_count: selectedEntry.dueCardCount || 0,
      total_forms_for_word: selectedEntry.totalVariants,
      forms_remaining_for_word: selectedEntry.remainingVariants.length,
      current_form_index: (selectedEntry.totalVariants - selectedEntry.remainingVariants.length) + 1,
      session_mode: sessionMode,
      study_variant: selectedVariant.key,
      ...selectedVariant,
    },
  };
}

export function advanceReviewSession(session, completedCard, { repeatMistake = false, random = Math.random } = {}) {
  const completedId = Number(completedCard?.id);
  let nextEntries;
  if (repeatMistake) {
    const failedEntry = session.entries.find((entry) => Number(entry.entryId) === completedId);
    const otherEntries = session.entries.filter((entry) => Number(entry.entryId) !== completedId);
    nextEntries = failedEntry ? [...otherEntries, failedEntry] : session.entries;
  } else {
    nextEntries = session.entries
      .map((entry) => {
        if (Number(entry.entryId) !== completedId) {
          return entry;
        }

        return {
          ...entry,
          remainingVariants: entry.remainingVariants.filter((variant) => variant.key !== completedCard?.study_variant),
        };
      })
      .filter((entry) => entry.remainingVariants && entry.remainingVariants.length > 0);
  }

  const selection = pickNextSessionCard(nextEntries, session.mode, completedId || null, random);

  return {
    session: {
      ...session,
      entries: nextEntries,
      lastEntryId: selection?.entryId || completedId || null,
      isComplete: nextEntries.length === 0,
    },
    currentCard: selection?.card || null,
  };
}

export function removeEntryFromReviewSession(session, entryId, random = Math.random) {
  const targetId = Number(entryId);
  const nextEntries = session.entries.filter((entry) => Number(entry.entryId) !== targetId);
  const selection = pickNextSessionCard(nextEntries, session.mode, targetId, random);

  return {
    session: {
      ...session,
      entries: nextEntries,
      lastEntryId: selection?.entryId || targetId || null,
      isComplete: nextEntries.length === 0,
    },
    currentCard: selection?.card || null,
  };
}
