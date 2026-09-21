import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import VocabularyDecksModal from './VocabularyDecksModal';
import VocabularyStatsHeader from './vocabulary/VocabularyStatsHeader';
import VocabularyStudyCard from './vocabulary/VocabularyStudyCard';
import VocabularyGroupManager from './vocabulary/VocabularyGroupManager';
import AddWordModal from './vocabulary/AddWordModal';
import VocabularyWordTable from './vocabulary/VocabularyWordTable';
import { buildVocabularyRound, restoreVocabularyRound } from '../utils/vocabularyRounds';
import {
  readOfflineVocabularyCacheAsync,
  writeOfflineVocabularyCache,
  saveOfflineStudySession,
  loadOfflineStudySession,
  getOfflineMutations,
  removeOfflineMutation,
  applyOfflineReview,
  applyOfflineLearned,
  applyOfflineFavorite,
  applyOfflineAddWord,
  applyOfflineDeleteWord,
  syncOfflineMutations,
  formatOfflineCacheTime,
} from '../utils/offlineVocabularyCache';

const STATIC_MODES = {
  due: 'Due now',
  once_all: 'All words — once each',
  favorites: 'Favorites only',
};

function getModeLabel(mode, groups = []) {
  if (STATIC_MODES[mode]) return STATIC_MODES[mode];
  if (typeof mode === 'string' && mode.startsWith('group:')) {
    const groupId = Number(mode.split(':')[1]);
    const group = groups.find((g) => g.id === groupId);
    return group ? `Group: ${group.name} — once each` : 'Group study — once each';
  }
  if (typeof mode === 'string' && mode.startsWith('groups:')) {
    const groupIds = mode.split(':')[1].split(',').map(Number).filter(Boolean);
    const names = groups.filter((g) => groupIds.includes(g.id)).map((g) => g.name);
    return names.length > 0 ? `Groups (${names.join(', ')}) — once each` : 'Multiple groups — once each';
  }
  return mode;
}

export default function Vocabulary() {
  const { user } = useAuth();
  const userId = user?.id || 1;

  const [words, setWords] = useState([]);
  const [dueWords, setDueWords] = useState([]);
  const [groups, setGroups] = useState([]);
  const [studyQueue, setStudyQueue] = useState([]);
  const [studyMode, setStudyMode] = useState('due');
  const [roundLap, setRoundLap] = useState(1);
  const [roundTotal, setRoundTotal] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [showFrequencyModal, setShowFrequencyModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [newWord, setNewWord] = useState({ word: '', translation: '', example: '', groupIds: [] });
  const [activeGroupMenuWordId, setActiveGroupMenuWordId] = useState(null);
  const [filter, setFilter] = useState('active');
  const [selectedGroupFilterIds, setSelectedGroupFilterIds] = useState([]);
  const [sortBy, setSortBy] = useState('newest');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [pendingFavoriteIds, setPendingFavoriteIds] = useState(() => new Set());
  const [pendingLearnedIds, setPendingLearnedIds] = useState(() => new Set());
  const groupMutationQueueRef = useRef(new Map());

  // Offline & Synchronization State
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [offlineMutationsCount, setOfflineMutationsCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const activeWords = useMemo(() => words.filter((word) => !word.learned_permanently_at), [words]);
  const favoriteWords = useMemo(() => activeWords.filter((word) => Boolean(word.is_favorite)), [activeWords]);
  const learnedWords = useMemo(() => words.filter((word) => Boolean(word.learned_permanently_at)), [words]);
  const mastered = useMemo(() => activeWords.filter((word) => Number(word.level) >= 5).length, [activeWords]);
  const currentWord = studyQueue[0] || null;
  const completed = Math.max(0, roundTotal - studyQueue.length);

  const quizOptions = useMemo(() => {
    if (!currentWord || words.length < 2) return [];
    const pool = words.filter((w) => w.id !== currentWord.id).map((w) => w.translation);
    const shuffled = [...pool].sort(() => 0.5 - Math.random()).slice(0, 3);
    return [currentWord.translation, ...shuffled].sort(() => 0.5 - Math.random());
  }, [currentWord, words]);

  const sortedWords = useMemo(() => {
    const list = [...words];
    if (sortBy === 'word_asc') return list.sort((a, b) => a.word.localeCompare(b.word));
    if (sortBy === 'translation_asc') return list.sort((a, b) => a.translation.localeCompare(b.translation));
    return list.sort((a, b) => b.id - a.id);
  }, [words, sortBy]);

  const visibleWords = useMemo(() => {
    let base = filter === 'learned' ? learnedWords : filter === 'favorites' ? words.filter((w) => w.is_favorite) : filter === 'all' ? sortedWords : activeWords;
    if (selectedGroupFilterIds.length > 0) {
      base = base.filter((w) => (w.groups || []).some((g) => selectedGroupFilterIds.includes(g.id)));
    }
    return base;
  }, [filter, selectedGroupFilterIds, sortedWords, activeWords, learnedWords]);

  const refreshMutationsCount = useCallback(() => {
    const list = getOfflineMutations(userId);
    setOfflineMutationsCount(list.length);
  }, [userId]);

  const loadVocabulary = useCallback(async (isSilent = false) => {
    const isNetworkOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (isNetworkOffline) {
      setIsOffline(true);
      const cached = await readOfflineVocabularyCacheAsync(userId);
      if (cached && Array.isArray(cached.words)) {
        setWords(cached.words);
        setDueWords(cached.dueWords || []);
        setGroups(cached.groups || []);
        if (!isSilent) {
          setNotice(`Офлайн-режим: ${cached.words.length} слов загружено локально (${formatOfflineCacheTime(cached.cachedAt)}).`);
        }

        const saved = await loadOfflineStudySession(studyMode, userId);
        if (saved?.session && Array.isArray(saved.session.queueIds) && saved.session.queueIds.length > 0) {
          const restored = restoreVocabularyRound(cached.words, saved.session);
          if (restored && restored.queue.length > 0) {
            setStudyQueue(restored.queue);
            setRoundTotal(restored.roundTotal);
            return;
          }
        }
        const initialDue = cached.dueWords || [];
        setStudyQueue(initialDue);
        setRoundTotal(initialDue.length);
        return;
      }
      setError('Нет подключения к сети и сохраненного офлайн-словаря');
      return;
    }

    try {
      const [wordsRes, dueRes, groupsRes] = await Promise.all([
        fetch('/english/api/vocabulary'),
        fetch('/english/api/vocabulary/due'),
        fetch('/english/api/vocabulary/groups'),
      ]);

      if (!wordsRes.ok || !dueRes.ok || !groupsRes.ok) {
        throw new Error('Server returned an error while loading vocabulary');
      }

      const [wordsData, dueData, groupsData] = await Promise.all([
        wordsRes.json(),
        dueRes.json(),
        groupsRes.json(),
      ]);

      const loadedWords = wordsData.words || [];
      const loadedDue = dueData.words || dueData.due_words || [];
      const loadedGroups = groupsData.groups || [];

      setWords(loadedWords);
      setDueWords(loadedDue);
      setGroups(loadedGroups);
      setIsOffline(false);

      // Persist snapshot to local IndexedDB/localStorage for offline availability
      writeOfflineVocabularyCache({
        words: loadedWords,
        dueWords: loadedDue,
        groups: loadedGroups,
        userId,
      });

      // Restore active study session if one was stored
      const saved = await loadOfflineStudySession(studyMode, userId);
      if (saved?.session && Array.isArray(saved.session.queueIds) && saved.session.queueIds.length > 0) {
        const restored = restoreVocabularyRound(loadedWords, saved.session);
        if (restored && restored.queue.length > 0) {
          setStudyQueue(restored.queue);
          setRoundTotal(restored.roundTotal);
          return;
        }
      }

      if (studyMode === 'due') {
        setStudyQueue(loadedDue);
        setRoundTotal(loadedDue.length);
      }
    } catch (err) {
      console.warn('Network load failed, falling back to offline cache:', err);
      setIsOffline(true);
      const cached = await readOfflineVocabularyCacheAsync(userId);
      if (cached && Array.isArray(cached.words)) {
        setWords(cached.words);
        setDueWords(cached.dueWords || []);
        setGroups(cached.groups || []);
        setNotice(`Офлайн-словарь активен: ${cached.words.length} слов загружено локально (${formatOfflineCacheTime(cached.cachedAt)}).`);
        const initialDue = cached.dueWords || [];
        setStudyQueue(initialDue);
        setRoundTotal(initialDue.length);
      } else {
        setError(`Failed to load vocabulary: ${err.message}`);
      }
    }
  }, [userId, studyMode]);

  const handleSync = useCallback(async () => {
    if (isSyncing || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    setIsSyncing(true);
    setError('');
    try {
      const res = await syncOfflineMutations(userId);
      refreshMutationsCount();
      if (res.synced > 0) {
        setNotice(`Синхронизировано ${res.synced} действий с сервером.`);
        await loadVocabulary(true);
      }
    } catch (err) {
      console.error('Error syncing offline mutations:', err);
      setError('Ошибка синхронизации с сервером');
    } finally {
      setIsSyncing(false);
    }
  }, [userId, isSyncing, refreshMutationsCount, loadVocabulary]);

  useEffect(() => {
    loadVocabulary();
    refreshMutationsCount();

    const onOnline = () => {
      setIsOffline(false);
      handleSync();
    };
    const onOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [loadVocabulary, handleSync, refreshMutationsCount]);

  const startRound = (mode) => {
    setStudyMode(mode);
    const queue = buildVocabularyRound(words, mode, dueWords);
    setStudyQueue(queue);
    setRoundTotal(queue.length);
    setRoundLap(1);
    saveOfflineStudySession(mode, { mode, queueIds: queue.map((w) => w.id), roundTotal: queue.length }, queue[0] || null, userId);
  };

  const handleReview = async (quality) => {
    if (!currentWord) return;
    const wordId = currentWord.id;
    const nextQueue = studyQueue.slice(1);
    setStudyQueue(nextQueue);
    setPendingReviewCount((c) => c + 1);
    const qualityNum = Number(quality);

    const isNetworkOffline = (typeof navigator !== 'undefined' && !navigator.onLine) || isOffline;

    if (isNetworkOffline) {
      // 100% OFFLINE MODE: calculate SM-2 progress, update local state & IndexedDB, enqueue mutation
      const res = applyOfflineReview({ wordId, quality: qualityNum }, userId);
      if (res && res.word) {
        setWords((prev) => prev.map((w) => (w.id === wordId ? res.word : w)));
        setDueWords((prev) => prev.filter((w) => w.id !== wordId));
      }
      saveOfflineStudySession(
        studyMode,
        { mode: studyMode, queueIds: nextQueue.map((w) => w.id), roundTotal },
        nextQueue[0] || null,
        userId
      );
      refreshMutationsCount();
      setNotice('Прогресс слова сохранен в офлайн-памяти устройства.');
      setPendingReviewCount((c) => Math.max(0, c - 1));
      return;
    }

    try {
      const res = await fetch(`/english/api/vocabulary/${wordId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quality: qualityNum }),
      });

      if (!res.ok) {
        throw new Error(`Review failed with status ${res.status}`);
      }

      const updatedWord = await res.json().catch(() => null);
      if (updatedWord && updatedWord.id) {
        setWords((prev) => prev.map((w) => (w.id === wordId ? updatedWord : w)));
        setDueWords((prev) => prev.filter((w) => w.id !== wordId));
      }

      // Keep offline cache synchronized with the latest review result
      const offlineRes = applyOfflineReview({ wordId, quality: qualityNum }, userId);
      // Remove newly enqueued mutation since server already accepted the review
      const mutations = getOfflineMutations(userId);
      const latestMut = mutations[mutations.length - 1];
      if (latestMut && latestMut.type === 'REVIEW_WORD' && latestMut.wordId === wordId) {
        removeOfflineMutation(latestMut.id, userId);
      }
      refreshMutationsCount();
    } catch (err) {
      console.warn('Network review sync error, saving progress offline:', err);
      // Offline fallback: save locally and enqueue sync mutation
      const res = applyOfflineReview({ wordId, quality: qualityNum }, userId);
      if (res && res.word) {
        setWords((prev) => prev.map((w) => (w.id === wordId ? res.word : w)));
        setDueWords((prev) => prev.filter((w) => w.id !== wordId));
      }
      refreshMutationsCount();
      setNotice('Связь прервана: прогресс сохранен локально и будет синхронизирован при подключении.');
    } finally {
      saveOfflineStudySession(
        studyMode,
        { mode: studyMode, queueIds: nextQueue.map((w) => w.id), roundTotal },
        nextQueue[0] || null,
        userId
      );
      setPendingReviewCount((c) => Math.max(0, c - 1));
    }
  };

  const handleToggleFavorite = async (word) => {
    const nextState = !word.is_favorite;
    setWords((prev) => prev.map((w) => (w.id === word.id ? { ...w, is_favorite: nextState ? 1 : 0 } : w)));

    const isNetworkOffline = (typeof navigator !== 'undefined' && !navigator.onLine) || isOffline;
    if (isNetworkOffline) {
      applyOfflineFavorite(word.id, nextState, userId);
      refreshMutationsCount();
      return;
    }

    try {
      const res = await fetch(`/english/api/vocabulary/${word.id}/favorite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: nextState }),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      applyOfflineFavorite(word.id, nextState, userId);
      const mutations = getOfflineMutations(userId);
      const latestMut = mutations[mutations.length - 1];
      if (latestMut && latestMut.type === 'FAVORITE_WORD' && latestMut.wordId === word.id) {
        removeOfflineMutation(latestMut.id, userId);
      }
    } catch (err) {
      console.warn('Favorite toggle network error, saving offline:', err);
      applyOfflineFavorite(word.id, nextState, userId);
      refreshMutationsCount();
    }
  };

  const handleToggleLearned = async (word, isLearned) => {
    const learnedVal = isLearned !== undefined ? isLearned : !word.learned_permanently_at;
    setWords((prev) =>
      prev.map((w) => (w.id === word.id ? { ...w, learned_permanently_at: learnedVal ? new Date().toISOString() : null } : w))
    );

    const isNetworkOffline = (typeof navigator !== 'undefined' && !navigator.onLine) || isOffline;
    if (isNetworkOffline) {
      applyOfflineLearned(word.id, learnedVal, userId);
      refreshMutationsCount();
      return;
    }

    try {
      const res = await fetch(`/english/api/vocabulary/${word.id}/learned-permanently`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learnedPermanently: learnedVal }),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      applyOfflineLearned(word.id, learnedVal, userId);
      const mutations = getOfflineMutations(userId);
      const latestMut = mutations[mutations.length - 1];
      if (latestMut && latestMut.type === 'LEARNED_WORD' && latestMut.wordId === word.id) {
        removeOfflineMutation(latestMut.id, userId);
      }
    } catch (err) {
      console.warn('Learned toggle network error, saving offline:', err);
      applyOfflineLearned(word.id, learnedVal, userId);
      refreshMutationsCount();
    }
  };

  const handleToggleWordGroup = async (word, groupId) => {
    const currentGroupIds = (word.groups || []).map((g) => g.id);
    const hasGroup = currentGroupIds.includes(groupId);
    const nextGroupIds = hasGroup ? currentGroupIds.filter((id) => id !== groupId) : [...currentGroupIds, groupId];
    const targetGroup = groups.find((g) => g.id === groupId);
    const nextGroups = hasGroup
      ? (word.groups || []).filter((g) => g.id !== groupId)
      : targetGroup
      ? [...(word.groups || []), targetGroup]
      : word.groups || [];

    setWords((items) => items.map((item) => (item.id === word.id ? { ...item, groups: nextGroups } : item)));

    try {
      await fetch(`/english/api/vocabulary/${word.id}/groups`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds: nextGroupIds }),
      });
    } catch (err) {
      console.error('Group update error:', err);
    }
  };

  const handleAddWord = async () => {
    if (!newWord.word.trim() || !newWord.translation.trim()) return;
    setBusy(true);

    const isNetworkOffline = (typeof navigator !== 'undefined' && !navigator.onLine) || isOffline;
    if (isNetworkOffline) {
      const res = applyOfflineAddWord(newWord, userId);
      if (res && res.word) {
        setWords((prev) => [res.word, ...prev]);
        setDueWords((prev) => [res.word, ...prev]);
      }
      setNewWord({ word: '', translation: '', example: '', groupIds: [] });
      setShowAddForm(false);
      refreshMutationsCount();
      setNotice('Слово добавлено офлайн и сохранилось в словаре.');
      setBusy(false);
      return;
    }

    try {
      const res = await fetch('/english/api/vocabulary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWord),
      });
      if (res.ok) {
        setNewWord({ word: '', translation: '', example: '', groupIds: [] });
        setShowAddForm(false);
        await loadVocabulary();
      }
    } catch (err) {
      console.warn('Add word network error, saving offline:', err);
      const offRes = applyOfflineAddWord(newWord, userId);
      if (offRes && offRes.word) {
        setWords((prev) => [offRes.word, ...prev]);
        setDueWords((prev) => [offRes.word, ...prev]);
      }
      setNewWord({ word: '', translation: '', example: '', groupIds: [] });
      setShowAddForm(false);
      refreshMutationsCount();
      setNotice('Слово сохранено локально и будет синхронизировано.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteWord = async (word) => {
    if (!confirm(`Delete "${word.word}"?`)) return;
    setWords((prev) => prev.filter((w) => w.id !== word.id));
    setDueWords((prev) => prev.filter((w) => w.id !== word.id));

    const isNetworkOffline = (typeof navigator !== 'undefined' && !navigator.onLine) || isOffline;
    if (isNetworkOffline) {
      applyOfflineDeleteWord(word.id, userId);
      refreshMutationsCount();
      return;
    }

    try {
      await fetch(`/english/api/vocabulary/${word.id}`, { method: 'DELETE' });
      applyOfflineDeleteWord(word.id, userId);
      const mutations = getOfflineMutations(userId);
      const latestMut = mutations[mutations.length - 1];
      if (latestMut && latestMut.type === 'DELETE_WORD' && latestMut.wordId === word.id) {
        removeOfflineMutation(latestMut.id, userId);
      }
    } catch (err) {
      console.warn('Delete word network error, deleting offline:', err);
      applyOfflineDeleteWord(word.id, userId);
      refreshMutationsCount();
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/english/api/vocabulary/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGroupName.trim() }),
      });
      if (res.ok) {
        setNewGroupName('');
        await loadVocabulary();
      }
    } catch (err) {
      setError(`Create group error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateGroup = async (groupId) => {
    if (!editingGroupName.trim()) return;
    try {
      await fetch(`/english/api/vocabulary/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingGroupName.trim() }),
      });
      setEditingGroupId(null);
      await loadVocabulary();
    } catch (err) {
      console.error('Update group error:', err);
    }
  };

  const handleDeleteGroup = async (group) => {
    if (!confirm(`Delete group "${group.name}"?`)) return;
    try {
      await fetch(`/english/api/vocabulary/groups/${group.id}`, { method: 'DELETE' });
      await loadVocabulary();
    } catch (err) {
      console.error('Delete group error:', err);
    }
  };

  const isCurrentGroupRound = typeof studyMode === 'string' && studyMode.startsWith('group:');

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <VocabularyStatsHeader
        words={words}
        activeWords={activeWords}
        dueWords={dueWords}
        learnedWords={learnedWords}
        groups={groups}
        onOpenFrequencyModal={() => setShowFrequencyModal(true)}
        onToggleGroupManager={() => setShowGroupManager((v) => !v)}
        onToggleAddForm={() => setShowAddForm((v) => !v)}
      />

      {/* Offline Status & Pending Sync Banner */}
      {(isOffline || offlineMutationsCount > 0) && (
        <div
          className={`rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-sm font-medium border shadow-sm ${
            isOffline ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">{isOffline ? '📴' : '🔄'}</span>
            <div>
              {isOffline ? (
                <span>
                  <strong>Офлайн-режим:</strong> прогресс слов сохраняется в памяти устройства.
                </span>
              ) : (
                <span>
                  <strong>Онлайн:</strong> есть локальные изменения слов, готовые к отправке.
                </span>
              )}
              {offlineMutationsCount > 0 && (
                <span className="ml-2 font-semibold">({offlineMutationsCount} в очереди)</span>
              )}
            </div>
          </div>
          {!isOffline && offlineMutationsCount > 0 && (
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50"
            >
              {isSyncing ? 'Синхронизация...' : 'Синхронизировать сейчас'}
            </button>
          )}
        </div>
      )}

      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-700 text-sm">{error}</div>}
      {notice && <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-700 text-sm">{notice}</div>}

      {showGroupManager && (
        <VocabularyGroupManager
          groups={groups}
          newGroupName={newGroupName}
          setNewGroupName={setNewGroupName}
          editingGroupId={editingGroupId}
          setEditingGroupId={setEditingGroupId}
          editingGroupName={editingGroupName}
          setEditingGroupName={setEditingGroupName}
          busy={busy}
          onCreateGroup={handleCreateGroup}
          onUpdateGroup={handleUpdateGroup}
          onDeleteGroup={handleDeleteGroup}
          onClose={() => setShowGroupManager(false)}
          onOpenFrequencyModal={() => setShowFrequencyModal(true)}
        />
      )}

      {showAddForm && (
        <AddWordModal
          newWord={newWord}
          setNewWord={setNewWord}
          groups={groups}
          busy={busy}
          onAddWord={handleAddWord}
          onClose={() => setShowAddForm(false)}
        />
      )}

      {currentWord ? (
        <VocabularyStudyCard
          currentWord={currentWord}
          studyMode={getModeLabel(studyMode, groups)}
          studyQueue={studyQueue}
          roundLap={roundLap}
          roundTotal={roundTotal}
          completed={completed}
          groups={groups}
          isCurrentGroupRound={isCurrentGroupRound}
          pendingReviewCount={pendingReviewCount}
          quizOptions={quizOptions}
          onReview={handleReview}
          onToggleFavorite={handleToggleFavorite}
          onToggleLearned={handleToggleLearned}
          onStartRound={startRound}
        />
      ) : (
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center border border-slate-100">
          <RotateCcw className="h-14 w-14 mx-auto text-green-500 mb-3" />
          <h3 className="text-2xl font-bold text-gray-800">Раунд завершен!</h3>
          <p className="text-gray-600 mt-1">Выберите режим тренировки или группу для повторения.</p>
        </div>
      )}

      <VocabularyWordTable
        words={words}
        activeWords={activeWords}
        learnedWords={learnedWords}
        visibleWords={visibleWords}
        groups={groups}
        filter={filter}
        setFilter={setFilter}
        sortBy={sortBy}
        setSortBy={setSortBy}
        selectedGroupFilterIds={selectedGroupFilterIds}
        setSelectedGroupFilterIds={setSelectedGroupFilterIds}
        mastered={mastered}
        activeGroupMenuWordId={activeGroupMenuWordId}
        setActiveGroupMenuWordId={setActiveGroupMenuWordId}
        pendingFavoriteIds={pendingFavoriteIds}
        pendingLearnedIds={pendingLearnedIds}
        busy={busy}
        onToggleWordGroup={handleToggleWordGroup}
        onToggleFavorite={handleToggleFavorite}
        onSetLearnedForever={handleToggleLearned}
        onDeleteWord={handleDeleteWord}
      />

      <VocabularyDecksModal
        isOpen={showFrequencyModal}
        onClose={() => setShowFrequencyModal(false)}
        onDecksGenerated={() => {
          loadVocabulary();
        }}
      />
    </div>
  );
}
