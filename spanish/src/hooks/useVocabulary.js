import { useCallback, useEffect, useState } from 'react';
import { profileApiUrl, profileFetch } from '../utils/api';

const API_BASE = '/spanish/api';
const INITIAL_STATS = {
  total_entries: 0,
  total_cards: 0,
  due_cards: 0,
  learned_cards: 0,
  mastered_entries: 0,
  pending_completion_entries: 0,
  unreviewable_cards: 0,
  directions: {
    source_to_target: {
      label: 'Spanish → Translation',
      total_cards: 0,
      due_cards: 0,
      learning_cards: 0,
      review_cards: 0,
      learned_cards: 0,
      unreviewable_cards: 0,
    },
    target_to_source: {
      label: 'Translation → Spanish',
      total_cards: 0,
      due_cards: 0,
      learning_cards: 0,
      review_cards: 0,
      learned_cards: 0,
      unreviewable_cards: 0,
    },
  },
};

export function useVocabulary() {
  const [entries, setEntries] = useState([]);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [stats, setStats] = useState(INITIAL_STATS);
  const [queueStats, setQueueStats] = useState({ total_due: 0, returned: 0, limit: 40 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchEntries = useCallback(async () => {
    const response = await profileFetch(profileApiUrl(`${API_BASE}/vocabulary`));
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to fetch vocabulary');
    }

    const data = await response.json();
    setEntries(data.entries || []);
    setStats(data.stats || INITIAL_STATS);
    return data;
  }, []);

  const fetchReviewQueue = useCallback(async (limit = 40) => {
    const response = await profileFetch(profileApiUrl(`${API_BASE}/vocabulary/review-queue?limit=${limit}`));
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to fetch review queue');
    }

    const data = await response.json();
    setReviewQueue(data.cards || []);
    setQueueStats(data.stats || { total_due: 0, returned: 0, limit });
    return data;
  }, []);

  const refreshVocabulary = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [entryData, queueData] = await Promise.all([
        fetchEntries(),
        fetchReviewQueue(),
      ]);

      return { entryData, queueData };
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [fetchEntries, fetchReviewQueue]);

  const addWord = useCallback(async (word, translation, example = '') => {
    const response = await profileFetch(profileApiUrl(`${API_BASE}/vocabulary`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, translation, example }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to add vocabulary entry');
    }

    const entry = await response.json();
    await refreshVocabulary();
    return entry;
  }, [refreshVocabulary]);

  const reviewCard = useCallback(async (cardId, grade) => {
    const response = await profileFetch(profileApiUrl(`${API_BASE}/vocabulary/review-cards/${cardId}/review`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grade }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to review card');
    }

    const data = await response.json();
    await refreshVocabulary();
    return data.card;
  }, [refreshVocabulary]);

  const markCardLearned = useCallback(async (cardId) => {
    const response = await profileFetch(profileApiUrl(`${API_BASE}/vocabulary/review-cards/${cardId}/learned`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to mark card learned');
    }

    const data = await response.json();
    await refreshVocabulary();
    return data.card;
  }, [refreshVocabulary]);

  const deleteEntry = useCallback(async (entryId) => {
    const response = await profileFetch(profileApiUrl(`${API_BASE}/vocabulary/${entryId}`), {
      method: 'DELETE',
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete vocabulary entry');
    }

    await refreshVocabulary();
  }, [refreshVocabulary]);

  const exportVocabulary = useCallback(async () => {
    const response = await profileFetch(profileApiUrl(`${API_BASE}/vocabulary/export`));
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to export vocabulary');
    }

    return response.json();
  }, []);

  const importVocabulary = useCallback(async (payload) => {
    const response = await profileFetch(profileApiUrl(`${API_BASE}/vocabulary/import`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to import vocabulary');
    }

    const data = await response.json();
    await refreshVocabulary();
    return data;
  }, [refreshVocabulary]);

  useEffect(() => {
    refreshVocabulary().catch((err) => {
      console.error('Error loading vocabulary hook:', err);
    });
  }, [refreshVocabulary]);

  return {
    entries,
    reviewQueue,
    stats,
    queueStats,
    isLoading,
    error,
    fetchEntries,
    fetchReviewQueue,
    refreshVocabulary,
    addWord,
    reviewCard,
    markCardLearned,
    deleteEntry,
    exportVocabulary,
    importVocabulary,
    words: entries,
    dueWords: reviewQueue,
  };
}
