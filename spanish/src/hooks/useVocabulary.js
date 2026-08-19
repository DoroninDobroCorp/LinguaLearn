import { useCallback, useEffect, useState } from 'react';
import { profileApiUrl, profileFetch } from '../utils/api';

const API_BASE = '/spanish/api';
const INITIAL_STATS = {
  total_entries: 0,
  due_entries: 0,
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
  const [groups, setGroups] = useState([]);
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

  const fetchGroups = useCallback(async () => {
    try {
      const response = await profileFetch(profileApiUrl(`${API_BASE}/vocabulary/groups`));
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch groups');
      }
      const data = await response.json();
      setGroups(data.groups || []);
      return data.groups || [];
    } catch (e) {
      console.error('Error fetching groups in hook:', e);
      return [];
    }
  }, []);

  const refreshVocabulary = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [entryData, queueData, groupsData] = await Promise.all([
        fetchEntries(),
        fetchReviewQueue(),
        fetchGroups(),
      ]);

      return { entryData, queueData, groupsData };
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [fetchEntries, fetchReviewQueue, fetchGroups]);

  const addWord = useCallback(async (word, translation, example = '', groupIds = []) => {
    const response = await profileFetch(profileApiUrl(`${API_BASE}/vocabulary`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, translation, example, groupIds }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to add vocabulary entry');
    }

    const entry = await response.json();
    await refreshVocabulary();
    return entry;
  }, [refreshVocabulary]);

  const reviewCard = useCallback(async (entryId, grade) => {
    const response = await profileFetch(profileApiUrl(`${API_BASE}/vocabulary/${entryId}/review`), {
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
    return data.review_card ?? data.card ?? data;
  }, [refreshVocabulary]);

  const markCardLearned = useCallback(async (entryId) => {
    const response = await profileFetch(profileApiUrl(`${API_BASE}/vocabulary/${entryId}/learned`), {
      method: 'POST',
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to mark card learned');
    }

    const data = await response.json();
    await refreshVocabulary();
    return data.entry ?? data.word ?? data;
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

  const createGroup = useCallback(async (name) => {
    const response = await profileFetch(profileApiUrl(`${API_BASE}/vocabulary/groups`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to create group');
    }
    const data = await response.json();
    if (data.groups) setGroups(data.groups);
    return data.group;
  }, []);

  const updateGroup = useCallback(async (id, name) => {
    const response = await profileFetch(profileApiUrl(`${API_BASE}/vocabulary/groups/${id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to update group');
    }
    const data = await response.json();
    if (data.groups) setGroups(data.groups);
    return data.group;
  }, []);

  const deleteGroup = useCallback(async (id) => {
    const response = await profileFetch(profileApiUrl(`${API_BASE}/vocabulary/groups/${id}`), {
      method: 'DELETE',
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete group');
    }
    const data = await response.json();
    if (data.groups) setGroups(data.groups);
    await refreshVocabulary();
  }, [refreshVocabulary]);

  const setWordGroups = useCallback(async (wordId, groupIds) => {
    const response = await profileFetch(profileApiUrl(`${API_BASE}/vocabulary/${wordId}/groups`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupIds }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to update word groups');
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
    groups,
    stats,
    queueStats,
    isLoading,
    error,
    fetchEntries,
    fetchReviewQueue,
    fetchGroups,
    refreshVocabulary,
    addWord,
    reviewCard,
    markCardLearned,
    deleteEntry,
    createGroup,
    updateGroup,
    deleteGroup,
    setWordGroups,
    exportVocabulary,
    importVocabulary,
    words: entries,
    dueWords: reviewQueue,
  };
}
