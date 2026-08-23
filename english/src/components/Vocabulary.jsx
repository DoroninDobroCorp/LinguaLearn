import VocabularyDecksModal from './VocabularyDecksModal';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  AlertCircle,
  BookMarked,
  Check,
  ChevronDown,
  ChevronUp,
  Edit2,
  Folder,
  FolderPlus,
  Plus,
  RotateCcw,
  Settings2,
  Star,
  Tag,
  Trash2,
  TrendingUp,
  Undo2,
  X,
  Volume2,
  Keyboard,
  Zap,
} from 'lucide-react';
import { buildVocabularyRound, restoreVocabularyRound } from '../utils/vocabularyRounds';
import { speakEnglish, soundEngine } from '../utils/soundEffects';
import { scoreTypedAnswer } from '../utils/answerMatching';

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

function Vocabulary() {
  const [words, setWords] = useState([]);
  const [dueWords, setDueWords] = useState([]);
  const [groups, setGroups] = useState([]);
  const [studyQueue, setStudyQueue] = useState([]);
  const [studyMode, setStudyMode] = useState('due');
  const [roundLap, setRoundLap] = useState(1);
  const [roundTotal, setRoundTotal] = useState(0);
  const [showTranslation, setShowTranslation] = useState(false);
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
  const [selectedStudyGroupIds, setSelectedStudyGroupIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [pendingFavoriteIds, setPendingFavoriteIds] = useState(() => new Set());
  const [pendingLearnedIds, setPendingLearnedIds] = useState(() => new Set());
  const [pendingGroupWordIds, setPendingGroupWordIds] = useState(() => new Set());
  const reviewingWordIdsRef = useRef(new Set());
  const favoriteMutationIdsRef = useRef(new Set());
  const groupMutationQueueRef = useRef(new Map());
  const learnedMutationIdsRef = useRef(new Set());
  const studySessionSaveChainRef = useRef(Promise.resolve());

  const [practiceStyle, setPracticeStyle] = useState('flip'); // 'flip' | 'typing' | 'quiz'
  const [practiceDirection, setPracticeDirection] = useState('en_to_ru'); // 'en_to_ru' | 'ru_to_en'
  const [typedInput, setTypedInput] = useState('');
  const [typedResult, setTypedResult] = useState(null);
  const [selectedQuizOption, setSelectedQuizOption] = useState(null);

  const activeWords = useMemo(() => words.filter((word) => !word.learned_permanently_at), [words]);
  const favoriteWords = useMemo(() => activeWords.filter((word) => Boolean(word.is_favorite)), [activeWords]);
  const learnedWords = useMemo(() => words.filter((word) => Boolean(word.learned_permanently_at)), [words]);
  const mastered = useMemo(() => activeWords.filter((word) => Number(word.level) >= 5).length, [activeWords]);
  const currentWord = studyQueue[0] || null;
  const completed = Math.max(0, roundTotal - studyQueue.length);

  const quizOptions = useMemo(() => {
    if (!currentWord || words.length < 2) return [];
    const isEnToRu = practiceDirection === 'en_to_ru';
    const correctTarget = isEnToRu ? currentWord.translation : currentWord.word;
    const others = words
      .filter((w) => w.id !== currentWord.id)
      .map((w) => (isEnToRu ? w.translation : w.word))
      .filter((t) => t && t !== correctTarget);
    const shuffledOthers = [...new Set(others)].sort(() => 0.5 - Math.random()).slice(0, 3);
    return [...new Set([correctTarget, ...shuffledOthers])].sort(() => 0.5 - Math.random());
  }, [currentWord, words, practiceDirection]);

  const apiMutation = async (url, options = {}) => {
    const response = await fetch(url, options);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const mutationError = new Error(data.error || 'Request failed');
      mutationError.status = response.status;
      mutationError.code = data.code;
      throw mutationError;
    }
    return response.json();
  };

  const loadGroups = async () => {
    try {
      const response = await fetch('/english/api/vocabulary/groups');
      if (response.ok) {
        const data = await response.json();
        setGroups(data.groups || []);
        return data.groups || [];
      }
    } catch (e) {
      console.error('Error fetching groups:', e);
    }
    return [];
  };

  const loadVocabulary = async ({ initializeDue = false } = {}) => {
    const [allResponse, dueResponse, sessionResponse, groupsData] = await Promise.all([
      fetch('/english/api/vocabulary'),
      fetch('/english/api/vocabulary/due'),
      initializeDue ? fetch('/english/api/vocabulary/study-session') : Promise.resolve(null),
      loadGroups(),
    ]);
    if (!allResponse.ok || !dueResponse.ok) throw new Error('Failed to load vocabulary');
    const [allData, dueData] = await Promise.all([allResponse.json(), dueResponse.json()]);
    const nextWords = allData.words || [];
    const nextDue = dueData.words || [];
    setWords(nextWords);
    setDueWords(nextDue);
    if (initializeDue) {
      const savedData = sessionResponse?.ok ? await sessionResponse.json().catch(() => ({})) : {};
      const saved = savedData.session;
      const restored = restoreVocabularyRound(nextWords, saved);
      if (restored) {
        setStudyQueue(restored.queue);
        setRoundTotal(restored.roundTotal);
        setStudyMode(restored.mode);
        const modeTitle = getModeLabel(restored.mode, groupsData);
        setNotice(restored.queue.length ? `Resumed ${modeTitle} round.` : `${modeTitle} round is complete.`);
      } else {
        const queue = buildVocabularyRound(nextWords, 'due', nextDue);
        setStudyQueue(queue);
        setRoundTotal(queue.length);
        setStudyMode('due');
      }
    }
  };

  useEffect(() => {
    loadVocabulary({ initializeDue: true }).catch((loadError) => setError(loadError.message));
  }, []);

  const persistStudySession = (mode, queue, total, { restart = false } = {}) => {
    const isGroup = typeof mode === 'string' && mode.startsWith('group:');
    if (mode !== 'once_all' && mode !== 'favorites' && !isGroup) return Promise.resolve();
    const payload = {
      mode,
      queueIds: queue.map((word) => Number(word.id)),
      roundTotal: total,
      restart,
    };
    const save = studySessionSaveChainRef.current
      .catch(() => undefined)
      .then(() => apiMutation('/english/api/vocabulary/study-session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }));
    studySessionSaveChainRef.current = save;
    return save;
  };

  const startRound = async (mode, { forceRestart = false } = {}) => {
    const modeTitle = getModeLabel(mode, groups);
    if (!forceRestart && studyMode === mode && studyQueue.length > 0) {
      setShowTranslation(false);
      setNotice(`Continuing the saved ${modeTitle} round with ${studyQueue.length} words left.`);
      return;
    }

    let savedSession = null;
    const isGroup = typeof mode === 'string' && mode.startsWith('group:');
    if (!forceRestart && (mode === 'once_all' || mode === 'favorites' || isGroup)) {
      try {
        const response = await fetch(`/english/api/vocabulary/study-session?mode=${encodeURIComponent(mode)}`);
        if (response.ok) {
          const data = await response.json();
          savedSession = data.session;
        }
      } catch {
        savedSession = null;
      }
    }

    const restored = !forceRestart ? restoreVocabularyRound(words, savedSession) : null;
    if (restored && restored.mode === mode) {
      setStudyQueue(restored.queue);
      setRoundTotal(restored.roundTotal);
      setStudyMode(mode);
      setShowTranslation(false);
      setNotice(restored.queue.length ? `Resumed ${modeTitle} round.` : `${modeTitle} round is complete.`);
      return;
    }

    const nextQueue = buildVocabularyRound(words, mode, dueWords);
    setStudyQueue(nextQueue);
    setRoundTotal(nextQueue.length);
    setRoundLap(1);
    setStudyMode(mode);
    setShowTranslation(false);

    if (mode === 'once_all' || mode === 'favorites' || isGroup) {
      persistStudySession(mode, nextQueue, nextQueue.length, { restart: true }).catch(() => undefined);
    }
  };

  const restartRound = (mode) => startRound(mode, { forceRestart: true });

  const addWord = async () => {
    if (!newWord.word.trim() || !newWord.translation.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const added = await apiMutation('/english/api/vocabulary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWord),
      });
      setNewWord({ word: '', translation: '', example: '', groupIds: [] });
      setShowAddForm(false);
      setNotice(`Added "${added.word}".`);
      await loadVocabulary();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reviewWord = async (quality) => {
    if (!currentWord || reviewingWordIdsRef.current.has(currentWord.id)) return;
    const reviewedWord = currentWord;
    reviewingWordIdsRef.current.add(reviewedWord.id);
    let nextQueue = studyQueue.slice(1);
    let nextTotal = roundTotal;

    // Infinite loop for group rounds: when the round finishes, automatically start next shuffled lap!
    const isGroupMode = typeof studyMode === 'string' && (studyMode.startsWith('group:') || studyMode.startsWith('groups:'));
    if (isGroupMode && nextQueue.length === 0) {
      const freshQueue = buildVocabularyRound(words, studyMode, dueWords);
      if (freshQueue.length > 0) {
        nextQueue = freshQueue;
        nextTotal = freshQueue.length;
        setRoundLap((l) => l + 1);
        setNotice(`🎉 Round complete! Starting next round (Lap ${roundLap + 1} with ${freshQueue.length} words reshuffled).`);
      }
    }

    setStudyQueue(nextQueue);
    setRoundTotal(nextTotal);
    setShowTranslation(false);
    setPendingReviewCount((c) => c + 1);

    persistStudySession(studyMode, nextQueue, nextTotal).catch(() => undefined);

    try {
      const updated = await apiMutation(`/english/api/vocabulary/${reviewedWord.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quality }),
      });
      setWords((prev) => prev.map((w) => (w.id === reviewedWord.id ? { ...w, ...updated } : w)));
      setDueWords((prev) => prev.filter((w) => w.id !== reviewedWord.id));
    } catch (err) {
      setError(`Failed to save review for ${reviewedWord.word}: ${err.message}`);
    } finally {
      reviewingWordIdsRef.current.delete(reviewedWord.id);
      setPendingReviewCount((c) => Math.max(0, c - 1));
    }
  };

  const toggleFavorite = async (word) => {
    const wordId = Number(word.id);
    if (favoriteMutationIdsRef.current.has(wordId)) return;
    favoriteMutationIdsRef.current.add(wordId);
    setPendingFavoriteIds((prev) => new Set(prev).add(wordId));

    const favorite = !Boolean(word.is_favorite);
    const patchFavorite = (item, value) => (item.id === word.id ? { ...item, is_favorite: value ? 1 : 0 } : item);
    const nextQueue = studyQueue
      .map((item) => patchFavorite(item, favorite))
      .filter((item) => studyMode !== 'favorites' || item.is_favorite);
    setWords((items) => items.map((item) => patchFavorite(item, favorite)));
    setDueWords((items) => items.map((item) => patchFavorite(item, favorite)));
    setStudyQueue(nextQueue);
    setNotice(favorite ? 'Added to favorites. Saving…' : 'Removed from favorites. Saving…');

    try {
      await apiMutation(`/english/api/vocabulary/${word.id}/favorite`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite }),
      });
      setNotice(favorite ? 'Added to favorites.' : 'Removed from favorites.');
    } catch (err) {
      setWords((items) => items.map((item) => patchFavorite(item, !favorite)));
      setDueWords((items) => items.map((item) => patchFavorite(item, !favorite)));
      setStudyQueue((items) => items.map((item) => patchFavorite(item, !favorite)));
      setError(`Failed to update favorite: ${err.message}`);
    } finally {
      favoriteMutationIdsRef.current.delete(wordId);
      setPendingFavoriteIds((prev) => {
        const next = new Set(prev);
        next.delete(wordId);
        return next;
      });
    }
  };

  const setLearnedForever = async (word, learned) => {
    const wordId = Number(word.id);
    if (learnedMutationIdsRef.current.has(wordId)) return;
    learnedMutationIdsRef.current.add(wordId);
    setPendingLearnedIds((prev) => new Set(prev).add(wordId));

    const patchLearned = (item, isLearned) => (item.id === word.id ? {
      ...item,
      learned_permanently_at: isLearned ? new Date().toISOString() : null,
      is_favorite: isLearned ? false : item.is_favorite,
      groups: isLearned ? [] : item.groups,
    } : item);
    const nextQueue = studyQueue.filter((item) => !learned || item.id !== word.id);
    setWords((items) => items.map((item) => patchLearned(item, learned)));
    setDueWords((items) => items.filter((item) => !learned || item.id !== word.id));
    setStudyQueue(nextQueue);
    if (learned && (word.groups || []).length > 0) {
      const removedGroupIds = (word.groups || []).map((g) => g.id);
      setGroups((curr) => curr.map((g) => removedGroupIds.includes(g.id) ? { ...g, word_count: Math.max(0, (g.word_count || 1) - 1) } : g));
    }
    setNotice(learned ? 'Marked as learned forever.' : 'Restored to study.');

    try {
      await apiMutation(`/english/api/vocabulary/${word.id}/permanent-learned`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learned }),
      });
    } catch (err) {
      setWords((items) => items.map((item) => patchLearned(item, !learned)));
      setError(`Failed to update learned state: ${err.message}`);
      loadVocabulary().catch(() => undefined);
    } finally {
      learnedMutationIdsRef.current.delete(wordId);
      setPendingLearnedIds((prev) => {
        const next = new Set(prev);
        next.delete(wordId);
        return next;
      });
    }
  };

  const deleteWord = async (word) => {
    if (!confirm(`Delete "${word.word}"?`)) return;
    setBusy(true);
    try {
      await apiMutation(`/english/api/vocabulary/${word.id}`, { method: 'DELETE' });
      setWords((prev) => prev.filter((w) => w.id !== word.id));
      setDueWords((prev) => prev.filter((w) => w.id !== word.id));
      setStudyQueue((prev) => prev.filter((w) => w.id !== word.id));
      setNotice(`Deleted "${word.word}".`);
      await loadGroups();
    } catch (err) {
      setError(`Failed to delete word: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  // Group operations
  const createGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await apiMutation('/english/api/vocabulary/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setNewGroupName('');
      setNotice(`Created group "${name}".`);
      await loadGroups();
    } catch (err) {
      setError(`Failed to create group: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const updateGroup = async (groupId) => {
    const name = editingGroupName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await apiMutation(`/english/api/vocabulary/groups/${groupId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      setEditingGroupId(null);
      setEditingGroupName('');
      setNotice('Group renamed.');
      await loadVocabulary();
    } catch (err) {
      setError(`Failed to rename group: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const deleteGroup = async (group) => {
    if (!confirm(`Delete group "${group.name}"? Words in this group will not be deleted.`)) return;
    setBusy(true);
    try {
      await apiMutation(`/english/api/vocabulary/groups/${group.id}`, { method: 'DELETE' });
      setNotice(`Deleted group "${group.name}".`);
      if (selectedGroupFilter === group.id) setSelectedGroupFilter('all');
      if (studyMode === `group:${group.id}`) startRound('due');
      await loadVocabulary();
    } catch (err) {
      setError(`Failed to delete group: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const toggleWordGroup = (word, groupId) => {
    const wordId = Number(word.id);
    const targetGroupId = Number(groupId);

    // 1. Calculate next group IDs
    const currentGroupIds = (word.groups || []).map((g) => g.id);
    const hasGroup = currentGroupIds.includes(targetGroupId);
    const nextGroupIds = hasGroup
      ? currentGroupIds.filter((id) => id !== targetGroupId)
      : [...currentGroupIds, targetGroupId];

    const targetGroup = groups.find((g) => g.id === targetGroupId);
    const nextGroups = hasGroup
      ? (word.groups || []).filter((g) => g.id !== targetGroupId)
      : targetGroup ? [...(word.groups || []), targetGroup] : word.groups || [];

    // 2. OPTIMISTIC UPDATE (0ms): update words state immediately
    setWords((items) => items.map((item) => {
      if (item.id === wordId) {
        return {
          ...item,
          groups: nextGroups,
          group_ids: nextGroupIds,
        };
      }
      return item;
    }));

    // 3. OPTIMISTIC UPDATE (0ms): update groups word_count & word_ids immediately
    setGroups((prevGroups) => prevGroups.map((g) => {
      if (g.id === targetGroupId) {
        const wordIds = new Set(g.word_ids || []);
        if (hasGroup) {
          wordIds.delete(wordId);
        } else {
          wordIds.add(wordId);
        }
        return {
          ...g,
          word_count: wordIds.size,
          word_ids: Array.from(wordIds),
        };
      }
      return g;
    }));

    // 4. Update study queue if active
    setStudyQueue((prevQueue) => prevQueue.map((w) => w.id === wordId ? { ...w, groups: nextGroups, group_ids: nextGroupIds } : w));

    // 5. Non-blocking background queue per wordId
    const previousPromise = groupMutationQueueRef.current.get(wordId) || Promise.resolve();
    const nextPromise = previousPromise
      .catch(() => undefined)
      .then(async () => {
        await apiMutation(`/english/api/vocabulary/${wordId}/groups`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupIds: nextGroupIds }),
        });
      })
      .catch((err) => {
        console.error('Group update error:', err);
        setError(`Failed to save group change: ${err.message}`);
        loadVocabulary().catch(() => undefined);
      })
      .finally(() => {
        if (groupMutationQueueRef.current.get(wordId) === nextPromise) {
          groupMutationQueueRef.current.delete(wordId);
        }
      });

    groupMutationQueueRef.current.set(wordId, nextPromise);
  };

  // Visible words filtered by active/favorites/learned/all + Group filter
  const visibleWords = useMemo(() => {
    let base = filter === 'learned' ? learnedWords : filter === 'favorites' ? words.filter((w) => w.is_favorite) : filter === 'all' ? words : activeWords;
    if (selectedGroupFilterIds.length > 0) {
      base = base.filter((w) => (w.groups || []).some((g) => selectedGroupFilterIds.includes(g.id)));
    }
    return base;
  }, [filter, selectedGroupFilterIds, words, activeWords, learnedWords]);

  const continuingAllRound = studyMode === 'once_all' && studyQueue.length > 0;
  const continuingFavoritesRound = studyMode === 'favorites' && studyQueue.length > 0;
  const isCurrentGroupRound = typeof studyMode === 'string' && studyMode.startsWith('group:');
  const currentStudyGroupId = isCurrentGroupRound ? Number(studyMode.split(':')[1]) : null;
  const currentStudyGroup = isCurrentGroupRound ? groups.find((g) => g.id === currentStudyGroupId) : null;
  const continuingGroupRound = isCurrentGroupRound && studyQueue.length > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header & Stats Card */}
      <div className="bg-white rounded-2xl shadow-xl p-6 border border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h2 className="text-3xl font-bold text-gray-800 flex items-center">
            <BookMarked className="h-8 w-8 mr-3 text-indigo-600" />
            Vocabulary Practice
          </h2>
          <div className="flex items-center gap-2">
                        <button
              type="button"
              onClick={() => setShowFrequencyModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 bg-purple-50/50 dark:bg-purple-950/40 hover:bg-purple-100/70 transition-colors shadow-sm"
              title="Сгенерировать колоды частотных слов CEFR по 25 слов"
            >
              <Sparkles className="h-4 w-4 text-purple-500" />
              <span>Частотные колоды</span>
            </button>
            <button
              type="button"
              onClick={() => setShowGroupManager((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/70 transition-colors"
            >
              <Folder className="h-4 w-4" />
              Manage Groups ({groups.length})
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-semibold shadow hover:opacity-95 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              Add Word
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            ['Total', words.length],
            ['Active', activeWords.length],
            ['Due', dueWords.length],
            ['Favorites', words.filter((w) => w.is_favorite).length],
            ['Learned', learnedWords.length],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-indigo-50/70 border border-indigo-100 p-3">
              <p className="text-xs font-semibold text-indigo-700">{label}</p>
              <p className="text-2xl font-bold text-indigo-900">{value}</p>
            </div>
          ))}
        </div>

        {/* Study Round Selectors */}
        <div className="mt-5 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Choose Study Mode</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => startRound('due')}
              className={`rounded-xl border px-4 py-3 font-semibold text-sm transition-all ${
                studyMode === 'due'
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-900 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
              }`}
            >
              Due now ({dueWords.length})
            </button>
            <button
              type="button"
              onClick={() => startRound('once_all')}
              className={`rounded-xl px-4 py-3 font-semibold text-sm transition-all ${
                studyMode === 'once_all'
                  ? 'bg-indigo-700 text-white ring-2 ring-indigo-400'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {continuingAllRound ? `Continue all words (${studyQueue.length} left)` : `All words — once each (${activeWords.length})`}
            </button>
            <button
              type="button"
              onClick={() => startRound('favorites')}
              className={`rounded-xl px-4 py-3 font-semibold text-sm text-white transition-all ${
                studyMode === 'favorites'
                  ? 'bg-amber-600 ring-2 ring-amber-400'
                  : 'bg-amber-500 hover:bg-amber-600'
              }`}
            >
              <Star className="inline h-4 w-4 mr-1 fill-current" />
              {continuingFavoritesRound ? `Continue favorites (${studyQueue.length} left)` : `Favorites only (${favoriteWords.length})`}
            </button>
          </div>

          {/* Group Study Rounds */}
          {groups.length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                <Folder className="h-3.5 w-3.5 text-indigo-600" />
                Study by Group
              </p>
              <div className="flex flex-wrap gap-2">
                {groups.map((group) => {
                  const isCurrentGroup = studyMode === `group:${group.id}`;
                  const groupActiveWords = activeWords.filter((w) => (w.groups || []).some((g) => g.id === group.id));
                  const isOngoing = isCurrentGroup && studyQueue.length > 0;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => startRound(`group:${group.id}`)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                        isCurrentGroup
                          ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50'
                      }`}
                    >
                      <Tag className="h-3 w-3" />
                      <span>{group.name}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isCurrentGroup ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
                        {isOngoing ? `${studyQueue.length} left` : groupActiveWords.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <p className="mt-3 text-xs text-gray-500">
          Once-each and group rounds use a saved snapshot. Adding or deleting words does not reset your progress.
        </p>

        {(continuingAllRound || continuingFavoritesRound || continuingGroupRound) && (
          <button
            type="button"
            onClick={() => restartRound(studyMode)}
            className="mt-2 text-xs font-semibold text-red-600 hover:text-red-700 underline"
          >
            Restart {getModeLabel(studyMode, groups)} from the beginning
          </button>
        )}
      </div>

      {/* Error & Notice Banners */}
      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-700 text-sm">{error}</div>}
      {notice && <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-700 text-sm">{notice}</div>}

      {/* Group Manager Modal/Drawer */}
      {showGroupManager && (
        <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-indigo-100 animate-fade-in space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Folder className="h-5 w-5 text-indigo-600" />
              Manage Word Groups
            </h3>
                        <button
              type="button"
              onClick={() => setShowFrequencyModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 bg-purple-50/50 dark:bg-purple-950/40 hover:bg-purple-100/70 transition-colors shadow-sm"
              title="Сгенерировать колоды частотных слов CEFR по 25 слов"
            >
              <Sparkles className="h-4 w-4 text-purple-500" />
              <span>Частотные колоды</span>
            </button>
            <button
              type="button"
              onClick={() => setShowGroupManager(false)}
              className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Create new group input */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="New group name (e.g., Colors, Travel, Verbs)"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createGroup()}
              className="flex-1 px-4 py-2 border-2 border-slate-200 focus:border-indigo-500 rounded-xl text-sm outline-none"
            />
            <button
              type="button"
              onClick={createGroup}
              disabled={busy || !newGroupName.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1"
            >
              <FolderPlus className="h-4 w-4" />
              Create
            </button>
          </div>

          {/* Existing groups list */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {groups.length === 0 ? (
              <p className="text-sm text-slate-500 italic py-2">No groups created yet. Create one above!</p>
            ) : (
              groups.map((group) => (
                <div key={group.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                  {editingGroupId === group.id ? (
                    <div className="flex-1 flex gap-2 mr-2">
                      <input
                        type="text"
                        value={editingGroupName}
                        onChange={(e) => setEditingGroupName(e.target.value)}
                        className="flex-1 px-3 py-1 border rounded-lg text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => updateGroup(group.id)}
                        className="px-3 py-1 bg-green-600 text-white text-xs font-semibold rounded-lg"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingGroupId(null)}
                        className="px-2 py-1 text-slate-500 text-xs rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-indigo-500" />
                      <span className="font-semibold text-slate-800 text-sm">{group.name}</span>
                      <span className="text-xs bg-indigo-100 text-indigo-800 font-semibold px-2 py-0.5 rounded-full">
                        {group.word_count || 0} words
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1">
                    {editingGroupId !== group.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingGroupId(group.id);
                          setEditingGroupName(group.name);
                        }}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-white"
                        title="Rename group"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteGroup(group)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-white"
                      title="Delete group"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Add New Word Form */}
      {showAddForm && (
        <div className="bg-white rounded-2xl shadow-xl p-6 border-2 border-indigo-100 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Plus className="h-5 w-5 text-indigo-600" />
              Add New Word
            </h3>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-3">
            <input
              placeholder="English word (e.g. apple)"
              value={newWord.word}
              onChange={(e) => setNewWord({ ...newWord, word: e.target.value })}
              className="w-full px-4 py-3 border-2 border-slate-200 focus:border-indigo-500 rounded-xl outline-none"
            />
            <input
              placeholder="Translation (e.g. яблоко)"
              value={newWord.translation}
              onChange={(e) => setNewWord({ ...newWord, translation: e.target.value })}
              className="w-full px-4 py-3 border-2 border-slate-200 focus:border-indigo-500 rounded-xl outline-none"
            />
            <textarea
              placeholder="Example sentence (optional)"
              value={newWord.example}
              onChange={(e) => setNewWord({ ...newWord, example: e.target.value })}
              className="w-full px-4 py-2 border-2 border-slate-200 focus:border-indigo-500 rounded-xl outline-none"
              rows={2}
            />

            {/* Select groups for this new word */}
            {groups.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1.5">Assign to groups (optional):</p>
                <div className="flex flex-wrap gap-2">
                  {groups.map((group) => {
                    const isSelected = (newWord.groupIds || []).includes(group.id);
                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => {
                          const current = newWord.groupIds || [];
                          const next = isSelected ? current.filter((id) => id !== group.id) : [...current, group.id];
                          setNewWord({ ...newWord, groupIds: next });
                        }}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        <Tag className="h-3 w-3" />
                        {group.name}
                        {isSelected && <Check className="h-3 w-3 ml-0.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={addWord}
              disabled={busy || !newWord.word.trim() || !newWord.translation.trim()}
              className="w-full rounded-xl bg-green-600 hover:bg-green-700 px-4 py-3 font-semibold text-white disabled:opacity-50 transition-colors shadow"
            >
              Add Word
            </button>
          </div>
        </div>
      )}

      {/* Flashcard Study Container */}
      {currentWord ? (
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <p className="text-sm font-semibold text-indigo-600 flex items-center gap-2">
                <span>{getModeLabel(studyMode, groups)}</span>
                {isCurrentGroupRound && (
                  <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-xs font-bold">
                    Lap {roundLap} (infinite loop)
                  </span>
                )}
                <span>· {completed + 1} of {roundTotal}</span>
              </p>
              <p className="text-xs text-slate-500">
                {studyQueue.length} remaining
                {pendingReviewCount > 0 ? ` · Saving ${pendingReviewCount} answer${pendingReviewCount === 1 ? '' : 's'}…` : ''}
              </p>
            </div>

            {/* Word Groups Badges on Card */}
            <div className="flex items-center gap-2">
              {(currentWord.groups || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(currentWord.groups || []).map((g) => (
                    <span key={g.id} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold">
                      <Tag className="h-3 w-3" />
                      {g.name}
                    </span>
                  ))}
                </div>
              )}
              {isCurrentGroupRound && (
                <button
                  type="button"
                  onClick={() => startRound('due')}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors shadow-sm"
                  title="Stop group practice and return to due words"
                >
                  <span>🛑 Stop practice</span>
                </button>
              )}
            </div>
          </div>

          {/* Mode & Direction Selector Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 mb-5">
            <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => { setPracticeStyle('flip'); setShowTranslation(false); setTypedResult(null); }}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  practiceStyle === 'flip' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🎴 Карточки
              </button>
              <button
                type="button"
                onClick={() => { setPracticeStyle('typing'); setShowTranslation(false); setTypedInput(''); setTypedResult(null); }}
                className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1 ${
                  practiceStyle === 'typing' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Keyboard className="h-3.5 w-3.5" />
                <span>Ввод слова</span>
              </button>
              <button
                type="button"
                onClick={() => { setPracticeStyle('quiz'); setShowTranslation(false); setSelectedQuizOption(null); }}
                className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1 ${
                  practiceStyle === 'quiz' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                <span>Тест 1 из 4</span>
              </button>
            </div>

            <div className="flex items-center gap-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => { setPracticeDirection('en_to_ru'); setShowTranslation(false); setTypedResult(null); }}
                className={`px-2.5 py-1.5 rounded-lg border transition-all ${
                  practiceDirection === 'en_to_ru'
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                🇬🇧 EN → 🇷🇺 RU
              </button>
              <button
                type="button"
                onClick={() => { setPracticeDirection('ru_to_en'); setShowTranslation(false); setTypedResult(null); }}
                className={`px-2.5 py-1.5 rounded-lg border transition-all ${
                  practiceDirection === 'ru_to_en'
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                🇷🇺 RU → 🇬🇧 EN
              </button>
            </div>
          </div>

          {/* Interactive Study Card */}
          {practiceStyle === 'flip' ? (
            <div
              onClick={() => setShowTranslation((v) => !v)}
              className="bg-gradient-to-br from-indigo-50/70 to-purple-50/70 rounded-2xl p-10 min-h-[240px] flex flex-col items-center justify-center cursor-pointer border-2 border-indigo-200 hover:border-indigo-300 transition-colors select-none text-center relative"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  speakEnglish(currentWord.word);
                }}
                className="absolute top-4 right-4 p-2 rounded-xl bg-white/80 hover:bg-white text-indigo-600 shadow-sm transition-all"
                title="Озвучить"
              >
                <Volume2 className="h-5 w-5" />
              </button>
              <p className="text-4xl sm:text-5xl font-bold text-indigo-950 mb-4">
                {practiceDirection === 'en_to_ru' ? currentWord.word : currentWord.translation}
              </p>
              {showTranslation ? (
                <div className="animate-fade-in space-y-2">
                  <p className="text-2xl sm:text-3xl font-semibold text-purple-900">
                    {practiceDirection === 'en_to_ru' ? currentWord.translation : currentWord.word}
                  </p>
                  {currentWord.example && (
                    <p className="text-base text-slate-600 italic mt-2 max-w-lg">“{currentWord.example}”</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500 font-medium">Нажмите на карточку, чтобы перевернуть</p>
              )}
            </div>
          ) : practiceStyle === 'typing' ? (
            <div className="bg-gradient-to-br from-indigo-50/70 to-purple-50/70 rounded-2xl p-8 min-h-[240px] flex flex-col items-center justify-center border-2 border-indigo-200 text-center space-y-4 relative">
              <button
                type="button"
                onClick={() => speakEnglish(currentWord.word)}
                className="absolute top-4 right-4 p-2 rounded-xl bg-white/80 hover:bg-white text-indigo-600 shadow-sm"
                title="Озвучить"
              >
                <Volume2 className="h-5 w-5" />
              </button>

              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Напишите перевод:</span>
                <p className="text-3xl sm:text-4xl font-bold text-indigo-950">
                  {practiceDirection === 'en_to_ru' ? currentWord.word : currentWord.translation}
                </p>
              </div>

              <div className="w-full max-w-md space-y-2">
                <input
                  type="text"
                  value={typedInput}
                  onChange={(e) => setTypedInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const expected = practiceDirection === 'en_to_ru' ? currentWord.translation : currentWord.word;
                      const res = scoreTypedAnswer(typedInput, expected);
                      setTypedResult(res);
                      setShowTranslation(true);
                      if (res.status === 'correct' || res.status === 'close') soundEngine.playCorrect();
                      else soundEngine.playWrong();
                    }
                  }}
                  placeholder={practiceDirection === 'en_to_ru' ? 'Введите перевод на русском...' : 'Type in English...'}
                  className="w-full px-4 py-3 rounded-xl border-2 border-indigo-300 focus:border-indigo-600 text-center font-bold text-lg outline-none bg-white"
                />

                {!typedResult && (
                  <button
                    type="button"
                    onClick={() => {
                      const expected = practiceDirection === 'en_to_ru' ? currentWord.translation : currentWord.word;
                      const res = scoreTypedAnswer(typedInput, expected);
                      setTypedResult(res);
                      setShowTranslation(true);
                      if (res.status === 'correct' || res.status === 'close') soundEngine.playCorrect();
                      else soundEngine.playWrong();
                    }}
                    disabled={!typedInput.trim()}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition-all"
                  >
                    Проверить ответ ↵
                  </button>
                )}
              </div>

              {typedResult && (
                <div className={`p-3 rounded-xl border text-sm font-bold animate-fade-in ${
                  typedResult.status === 'correct'
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                    : typedResult.status === 'close'
                    ? 'bg-amber-50 border-amber-400 text-amber-800'
                    : 'bg-rose-50 border-rose-400 text-rose-800'
                }`}>
                  {typedResult.status === 'correct' ? (
                    <span>✅ Идеально верно!</span>
                  ) : typedResult.status === 'close' ? (
                    <span>⚠️ Почти точно (опечатка). Правильно: {practiceDirection === 'en_to_ru' ? currentWord.translation : currentWord.word}</span>
                  ) : (
                    <span>❌ Правильный ответ: {practiceDirection === 'en_to_ru' ? currentWord.translation : currentWord.word}</span>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Quiz Mode (1 of 4) */
            <div className="bg-gradient-to-br from-indigo-50/70 to-purple-50/70 rounded-2xl p-8 min-h-[240px] flex flex-col items-center justify-center border-2 border-indigo-200 text-center space-y-5 relative">
              <button
                type="button"
                onClick={() => speakEnglish(currentWord.word)}
                className="absolute top-4 right-4 p-2 rounded-xl bg-white/80 hover:bg-white text-indigo-600 shadow-sm"
                title="Озвучить"
              >
                <Volume2 className="h-5 w-5" />
              </button>

              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Выберите правильный перевод:</span>
                <p className="text-3xl sm:text-4xl font-bold text-indigo-950">
                  {practiceDirection === 'en_to_ru' ? currentWord.word : currentWord.translation}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                {quizOptions.map((opt, idx) => {
                  const correctTarget = practiceDirection === 'en_to_ru' ? currentWord.translation : currentWord.word;
                  const isSelected = selectedQuizOption === opt;
                  let optStyle = 'bg-white border-slate-200 hover:border-indigo-400 text-slate-800';

                  if (selectedQuizOption) {
                    if (opt === correctTarget) {
                      optStyle = 'bg-emerald-50 border-emerald-500 text-emerald-900 font-bold';
                    } else if (isSelected) {
                      optStyle = 'bg-rose-50 border-rose-500 text-rose-900';
                    } else {
                      optStyle = 'opacity-40 border-slate-200';
                    }
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        if (selectedQuizOption) return;
                        setSelectedQuizOption(opt);
                        setShowTranslation(true);
                        if (opt === correctTarget) soundEngine.playCorrect();
                        else soundEngine.playWrong();
                      }}
                      disabled={Boolean(selectedQuizOption)}
                      className={`p-3.5 rounded-xl border-2 font-semibold text-sm transition-all shadow-sm ${optStyle}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {showTranslation && (
            <div className="space-y-4 mt-6 animate-fade-in">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  [0, X, "Don't Know", 'bg-red-500 hover:bg-red-600'],
                  [1, AlertCircle, 'Hard', 'bg-orange-500 hover:bg-orange-600'],
                  [2, Check, 'Good', 'bg-blue-500 hover:bg-blue-600'],
                  [3, TrendingUp, 'Easy', 'bg-green-600 hover:bg-green-700'],
                ].map(([quality, Icon, label, color]) => (
                  <button
                    key={quality}
                    type="button"
                    onClick={() => reviewWord(quality)}
                    className={`${color} rounded-xl p-3 font-semibold text-white transition-colors shadow-sm`}
                  >
                    <Icon className="h-5 w-5 mx-auto mb-1" />
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => toggleFavorite(currentWord)}
                  disabled={pendingFavoriteIds.has(Number(currentWord.id))}
                  className={`rounded-xl border-2 p-3 font-semibold text-xs sm:text-sm disabled:opacity-50 transition-colors ${
                    currentWord.is_favorite
                      ? 'border-amber-500 bg-amber-100 text-amber-900'
                      : 'border-amber-300 bg-white text-amber-700 hover:bg-amber-50'
                  }`}
                >
                  <Star className={`h-5 w-5 mx-auto mb-1 ${currentWord.is_favorite ? 'fill-current' : ''}`} />
                  {currentWord.is_favorite ? 'Favorited' : 'Favorite'}
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
                {/* Group selector dropdown on flashcard */}
                {groups.length > 0 && (
                  <div className="relative inline-block flex-1">
                    <button
                      type="button"
                      onClick={() => setActiveGroupMenuWordId(activeGroupMenuWordId === currentWord.id ? null : currentWord.id)}
                      className="w-full py-2.5 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 font-semibold text-xs inline-flex items-center justify-between"
                    >
                      <span className="flex items-center gap-1">
                        <Tag className="h-3.5 w-3.5 text-indigo-600" />
                        Manage word groups ({(currentWord.groups || []).length})
                      </span>
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    {activeGroupMenuWordId === currentWord.id && (
                      <div className="absolute bottom-full mb-1 left-0 w-full bg-white rounded-xl shadow-2xl border border-slate-200 p-2 z-20 space-y-1">
                        {groups.map((group) => {
                          const isAttached = (currentWord.groups || []).some((g) => g.id === group.id);
                          return (
                            <button
                              key={group.id}
                              type="button"
                              onClick={() => toggleWordGroup(currentWord, group.id)}
                              className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between ${
                                isAttached ? 'bg-indigo-50 text-indigo-800' : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <span>{group.name}</span>
                              {isAttached ? <Check className="h-3.5 w-3.5 text-indigo-600" /> : <Plus className="h-3.5 w-3.5 text-slate-400" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setLearnedForever(currentWord, true)}
                  disabled={pendingLearnedIds.has(Number(currentWord.id))}
                  className="rounded-xl bg-slate-800 hover:bg-slate-900 px-4 py-2.5 font-semibold text-xs text-white disabled:opacity-50 transition-colors"
                >
                  Mark learned forever
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center border border-slate-100">
          <RotateCcw className="h-14 w-14 mx-auto text-green-500 mb-3" />
          <h3 className="text-2xl font-bold text-gray-800">
            {isCurrentGroupRound && currentStudyGroup ? `Group «${currentStudyGroup.name}» round complete!` : 'Round complete!'}
          </h3>
          <p className="text-gray-600 mt-1">Choose any mode or group above to start a new shuffled round.</p>
        </div>
      )}

      {/* Vocabulary Word List Section */}
      <div className="bg-white rounded-2xl shadow-xl p-6 border border-slate-100 space-y-4">
        {/* Status Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {[
              ['active', `Active (${activeWords.length})`],
              ['favorites', `Favorites (${words.filter((w) => w.is_favorite).length})`],
              ['learned', `Learned (${learnedWords.length})`],
              ['all', `All (${words.length})`],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  filter === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 outline-none"
              >
                <option value="newest">✨ Сначала новые</option>
                <option value="word_asc">🔤 Английский (A–Z)</option>
                <option value="translation_asc">🇷🇺 Перевод (А–Я)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Multi-group filter row for entries list */}
        {groups.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 p-2 bg-indigo-50/60 border border-indigo-100 rounded-2xl">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 mr-1">
              <Tag className="h-3.5 w-3.5 text-indigo-600" />
              <span>Filter groups:</span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedGroupFilterIds([])}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                selectedGroupFilterIds.length === 0
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-indigo-50 border border-slate-200'
              }`}
            >
              All ({words.length})
            </button>
            {groups.map((g) => {
              const isSelected = selectedGroupFilterIds.includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    setSelectedGroupFilterIds((prev) =>
                      prev.includes(g.id) ? prev.filter((id) => id !== g.id) : [...prev, g.id]
                    );
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-300'
                      : 'bg-white text-indigo-950 hover:bg-indigo-50 border border-indigo-200/70'
                  }`}
                >
                  <span>{g.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    isSelected ? 'bg-indigo-800 text-indigo-100' : 'bg-indigo-100 text-indigo-900'
                  }`}>
                    {g.word_count || 0}
                  </span>
                </button>
              );
            })}
            {selectedGroupFilterIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedGroupFilterIds([])}
                className="text-xs text-indigo-700 hover:text-indigo-900 font-semibold underline ml-auto"
              >
                Clear ({selectedGroupFilterIds.length} sel.)
              </button>
            )}
          </div>
        )}

        <p className="text-xs text-slate-500">{mastered} active words have reached SRS level 5.</p>

        {/* Word rows */}
        <div className="space-y-2 max-h-[36rem] overflow-y-auto pr-1">
          {visibleWords.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8 italic">No words match the selected filters.</p>
          ) : (
            visibleWords.map((word) => (
              <div
                key={word.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50/80 hover:bg-slate-100/80 border border-slate-100 rounded-xl transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-900 text-lg">{word.word}</p>
                    {word.is_favorite && <Star className="h-4 w-4 fill-amber-500 text-amber-500" />}
                    {word.learned_permanently_at && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        Learned forever
                      </span>
                    )}
                  </div>
                  <p className="text-gray-700 text-sm font-medium">{word.translation}</p>
                  {word.example && <p className="text-xs text-slate-500 italic">“{word.example}”</p>}

                  {/* Group tags */}
                  {(word.groups || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(word.groups || []).map((g) => (
                        <span
                          key={g.id}
                          className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100/70 text-indigo-800 border border-indigo-200/50"
                        >
                          <Tag className="h-2.5 w-2.5" />
                          {g.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-center relative">
                  {/* Group quick toggle button */}
                  {groups.length > 0 && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setActiveGroupMenuWordId(activeGroupMenuWordId === word.id ? null : word.id)}
                        title="Manage groups for this word"
                        className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                      >
                        <Tag className="h-4 w-4" />
                      </button>
                      {activeGroupMenuWordId === word.id && (
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-2xl border border-slate-200 p-2 z-20 space-y-1">
                          <p className="text-[10px] font-bold uppercase text-slate-400 px-2 py-1">Groups:</p>
                          {groups.map((group) => {
                            const isAttached = (word.groups || []).some((g) => g.id === group.id);
                            return (
                              <button
                                key={group.id}
                                type="button"
                                onClick={() => toggleWordGroup(word, group.id)}
                                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between ${
                                  isAttached ? 'bg-indigo-50 text-indigo-800' : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <span>{group.name}</span>
                                {isAttached ? <Check className="h-3.5 w-3.5 text-indigo-600" /> : <Plus className="h-3.5 w-3.5 text-slate-400" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Favorite button */}
                  <button
                    type="button"
                    onClick={() => toggleFavorite(word)}
                    disabled={pendingFavoriteIds.has(Number(word.id))}
                    title={word.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                    className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                      word.is_favorite ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                    }`}
                  >
                    <Star className={`h-4 w-4 ${word.is_favorite ? 'fill-current' : ''}`} />
                  </button>

                  {/* Learned Forever toggle */}
                  {word.learned_permanently_at ? (
                    <button
                      type="button"
                      onClick={() => setLearnedForever(word, false)}
                      disabled={pendingLearnedIds.has(Number(word.id))}
                      title="Restore to study"
                      className="p-2 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-50"
                    >
                      <Undo2 className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLearnedForever(word, true)}
                      disabled={pendingLearnedIds.has(Number(word.id))}
                      title="Mark learned forever"
                      className="p-2 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => deleteWord(word)}
                    disabled={busy}
                    title="Delete word"
                    className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
          <VocabularyDecksModal
        isOpen={showFrequencyModal}
        onClose={() => setShowFrequencyModal(false)}
        onDecksGenerated={() => {
          if (typeof fetchVocabulary === 'function') fetchVocabulary();
          if (typeof fetchGroups === 'function') fetchGroups();
        }}
      />

</div>
  );
}

export default Vocabulary;
