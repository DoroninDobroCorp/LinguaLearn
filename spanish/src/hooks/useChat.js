import { useState, useCallback, useRef, useEffect } from 'react';

const API_BASE = '/spanish/api';

export function useChat() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/chat/history`);
      if (!response.ok) throw new Error('Failed to load chat history');
      const data = await response.json();
      setMessages(data);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Error loading chat history:', err);
    }
  }, []);

  const sendMessage = useCallback(async (message) => {
    if (!message.trim()) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    const userMessage = { role: 'user', content: message, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();
      const assistantMessage = {
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString(),
        topicChanges: data.topicChanges,
      };

      setMessages(prev => [...prev, assistantMessage]);
      return assistantMessage;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Request was cancelled');
      } else {
        setError(err.message);
        console.error('Error sending message:', err);
      }
      throw err;
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, []);

  const clearChat = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/chat/clear`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to clear chat');
      
      setMessages([]);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Error clearing chat:', err);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearChat,
    loadHistory,
  };
}
