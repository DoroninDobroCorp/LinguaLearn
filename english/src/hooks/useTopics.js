import { useState, useCallback, useEffect, useRef } from 'react';

const API_BASE = '/english/api';

function useDebounce(callback, delay) {
  const timeoutRef = useRef(null);

  return useCallback((...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]);
}

export function useTopics() {
  const [topics, setTopics] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const cacheRef = useRef({ data: null, timestamp: 0 });
  const CACHE_DURATION = 5000;

  const fetchTopics = useCallback(async (force = false) => {
    const now = Date.now();
    
    if (!force && cacheRef.current.data && (now - cacheRef.current.timestamp) < CACHE_DURATION) {
      setTopics(cacheRef.current.data);
      return cacheRef.current.data;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/topics`);
      if (!response.ok) throw new Error('Failed to fetch topics');
      
      const data = await response.json();
      setTopics(data);
      cacheRef.current = { data, timestamp: now };
      
      return data;
    } catch (err) {
      setError(err.message);
      console.error('Error fetching topics:', err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchTopicsDebounced = useDebounce(fetchTopics, 500);

  const updateTopic = useCallback(async (topicId, updates) => {
    try {
      const response = await fetch(`${API_BASE}/topics/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: topicId, ...updates }),
      });

      if (!response.ok) throw new Error('Failed to update topic');
      
      const updatedTopic = await response.json();
      setTopics(prev => 
        prev.map(t => t.id === topicId ? updatedTopic : t)
      );
      cacheRef.current = { data: null, timestamp: 0 };
      
      return updatedTopic;
    } catch (err) {
      setError(err.message);
      console.error('Error updating topic:', err);
      throw err;
    }
  }, []);

  const deleteTopic = useCallback(async (topicId) => {
    try {
      const response = await fetch(`${API_BASE}/topics/${topicId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete topic');
      
      setTopics(prev => prev.filter(t => t.id !== topicId));
      cacheRef.current = { data: null, timestamp: 0 };
    } catch (err) {
      setError(err.message);
      console.error('Error deleting topic:', err);
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  return {
    topics,
    isLoading,
    error,
    fetchTopics,
    fetchTopicsDebounced,
    updateTopic,
    deleteTopic,
  };
}
