import { useState, useCallback, useEffect } from 'react';

const API_BASE = '/spanish/api';

export function calculateNextReview(quality, reviewCount, currentInterval = 1) {
  let interval;
  
  if (quality === 0) {
    interval = 0;
  } else if (quality === 1) {
    interval = 1;
  } else if (quality === 2) {
    const intervals = [1, 3, 7, 14, 30, 60];
    interval = intervals[Math.min(reviewCount, intervals.length - 1)];
  } else {
    const intervals = [3, 7, 14, 30, 60, 90];
    interval = intervals[Math.min(reviewCount, intervals.length - 1)];
  }
  
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);
  
  return {
    nextReview: nextReview.toISOString(),
    interval,
  };
}

export function useVocabulary() {
  const [words, setWords] = useState([]);
  const [dueWords, setDueWords] = useState([]);
  const [stats, setStats] = useState({ total: 0, due: 0, mastered: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchWords = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/vocabulary`);
      if (!response.ok) throw new Error('Failed to fetch vocabulary');
      
      const data = await response.json();
      setWords(data);
      
      const now = new Date();
      const due = data.filter(w => new Date(w.next_review) <= now).length;
      const mastered = data.filter(w => w.review_count >= 5 && w.level >= 2).length;
      
      setStats({
        total: data.length,
        due,
        mastered,
      });
      
      return data;
    } catch (err) {
      setError(err.message);
      console.error('Error fetching vocabulary:', err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchDueWords = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/vocabulary/due`);
      if (!response.ok) throw new Error('Failed to fetch due words');
      
      const data = await response.json();
      setDueWords(data);
      return data;
    } catch (err) {
      setError(err.message);
      console.error('Error fetching due words:', err);
      return [];
    }
  }, []);

  const addWord = useCallback(async (word, translation, example = '') => {
    try {
      const response = await fetch(`${API_BASE}/vocabulary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, translation, example }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add word');
      }
      
      const newWord = await response.json();
      setWords(prev => [newWord, ...prev]);
      setStats(prev => ({ ...prev, total: prev.total + 1, due: prev.due + 1 }));
      
      return newWord;
    } catch (err) {
      setError(err.message);
      console.error('Error adding word:', err);
      throw err;
    }
  }, []);

  const reviewWord = useCallback(async (wordId, quality) => {
    try {
      const word = words.find(w => w.id === wordId) || dueWords.find(w => w.id === wordId);
      if (!word) throw new Error('Word not found');
      
      const { nextReview, interval } = calculateNextReview(
        quality,
        word.review_count,
        word.interval
      );
      
      const response = await fetch(`${API_BASE}/vocabulary/${wordId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quality,
          nextReview,
          interval,
        }),
      });

      if (!response.ok) throw new Error('Failed to review word');
      
      const updatedWord = await response.json();
      setWords(prev => prev.map(w => w.id === wordId ? updatedWord : w));
      setDueWords(prev => prev.filter(w => w.id !== wordId));
      await fetchWords();
      
      return updatedWord;
    } catch (err) {
      setError(err.message);
      console.error('Error reviewing word:', err);
      throw err;
    }
  }, [words, dueWords, fetchWords]);

  const deleteWord = useCallback(async (wordId) => {
    try {
      const response = await fetch(`${API_BASE}/vocabulary/${wordId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete word');
      
      setWords(prev => prev.filter(w => w.id !== wordId));
      setDueWords(prev => prev.filter(w => w.id !== wordId));
      setStats(prev => ({ ...prev, total: prev.total - 1 }));
    } catch (err) {
      setError(err.message);
      console.error('Error deleting word:', err);
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchWords();
    fetchDueWords();
  }, [fetchWords, fetchDueWords]);

  return {
    words,
    dueWords,
    stats,
    isLoading,
    error,
    fetchWords,
    fetchDueWords,
    addWord,
    reviewWord,
    deleteWord,
  };
}
