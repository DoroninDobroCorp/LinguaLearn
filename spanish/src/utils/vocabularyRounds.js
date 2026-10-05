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

export function shuffleSessionEntries(entries = [], random = Math.random) {
  const copy = [...entries];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const swapIndex = Math.floor(random() * (i + 1));
    [copy[i], copy[swapIndex]] = [copy[swapIndex], copy[i]];
  }
  return copy;
}

export function chooseRandomItem(values = [], random = Math.random) {
  if (!values || values.length === 0) {
    return null;
  }
  return values[Math.floor(random() * values.length)] || values[0];
}

export function pickNextSessionCard(sessionEntries, sessionMode = 'due', previousEntryId = null, random = Math.random) {
  const activeEntries = (sessionEntries || []).filter((entry) => entry.remainingVariants && entry.remainingVariants.length > 0);
  if (activeEntries.length === 0) {
    return null;
  }

  const prevId = previousEntryId != null ? Number(previousEntryId) : null;
  const candidateEntries = activeEntries.length > 1 && prevId != null
    ? activeEntries.filter((entry) => Number(entry.entryId) !== prevId)
    : activeEntries;

  // Strict round queue: always take the head of the candidate queue (FIFO order).
  // This guarantees every unseen word in the round is presented before any repeated/re-queued card.
  const selectedEntry = (candidateEntries.length > 0 ? candidateEntries : activeEntries)[0];
  const selectedVariant = selectedEntry?.remainingVariants?.[0] || null;

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
      is_repeat_mistake: Boolean(selectedEntry.isMistakeRepeat),
      ...selectedVariant,
      image_url: selectedVariant.image_url || selectedEntry.image_url || null,
    },
  };
}

export function advanceReviewSession(session, completedCard, { repeatMistake = false, random = Math.random } = {}) {
  const completedId = Number(completedCard?.id);
  let nextEntries;

  if (repeatMistake) {
    const failedEntry = session.entries.find((entry) => Number(entry.entryId) === completedId);
    const otherEntries = session.entries.filter((entry) => Number(entry.entryId) !== completedId);
    // Move failed entry to the very end of the round queue so all unseen words get their turn first
    const markedFailed = failedEntry ? { ...failedEntry, isMistakeRepeat: true } : null;
    nextEntries = markedFailed ? [...otherEntries, markedFailed] : session.entries;
  } else {
    const completedEntry = session.entries.find((entry) => Number(entry.entryId) === completedId);
    const otherEntries = session.entries.filter((entry) => Number(entry.entryId) !== completedId);

    if (completedEntry) {
      const remainingVariants = (completedEntry.remainingVariants || []).filter(
        (variant) => variant.key !== completedCard?.study_variant
      );
      if (remainingVariants.length > 0) {
        // Multi-variant entry: push remaining variants to end of round so other words get their turn first
        nextEntries = [...otherEntries, { ...completedEntry, remainingVariants }];
      } else {
        nextEntries = otherEntries;
      }
    } else {
      nextEntries = session.entries;
    }
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
