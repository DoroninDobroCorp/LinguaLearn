import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import VocabularyDecksModal from './VocabularyDecksModal';
import VocabularyStatsHeader from './vocabulary/VocabularyStatsHeader';
import VocabularyStudyCard from './vocabulary/VocabularyStudyCard';
import VocabularyGroupManager from './vocabulary/VocabularyGroupManager';
import AddWordModal from './vocabulary/AddWordModal';
import VocabularyWordTable from './vocabulary/VocabularyWordTable';
import { buildVocabularyRound, restoreVocabularyRound } from '../utils/vocabularyRounds';

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

  const loadVocabulary = async () => {
    try {
      const [wordsRes, dueRes, groupsRes] = await Promise.all([
        fetch('/english/api/vocabulary'),
        fetch('/english/api/vocabulary/due'),
        fetch('/english/api/vocabulary/groups'),
      ]);

      const [wordsData, dueData, groupsData] = await Promise.all([
        wordsRes.json(),
        dueRes.json(),
        groupsRes.json(),
      ]);

      setWords(wordsData.words || []);
      setDueWords(dueData.due_words || []);
      setGroups(groupsData.groups || []);
      setStudyQueue(dueData.due_words || []);
      setRoundTotal((dueData.due_words || []).length);
    } catch (err) {
      setError(`Failed to load vocabulary: ${err.message}`);
    }
  };

  useEffect(() => {
    loadVocabulary();
  }, []);

  const startRound = (mode) => {
    setStudyMode(mode);
    let queue = [];
    if (mode === 'due') queue = [...dueWords];
    else if (mode === 'once_all') queue = [...activeWords].sort(() => 0.5 - Math.random());
    else if (mode === 'favorites') queue = [...favoriteWords].sort(() => 0.5 - Math.random());
    else if (typeof mode === 'string' && mode.startsWith('group:')) {
      const gId = Number(mode.split(':')[1]);
      queue = activeWords.filter((w) => (w.groups || []).some((g) => g.id === gId)).sort(() => 0.5 - Math.random());
    }
    setStudyQueue(queue);
    setRoundTotal(queue.length);
    setRoundLap(1);
  };

  const handleReview = async (quality) => {
    if (!currentWord) return;
    const wordId = currentWord.id;
    setStudyQueue((prev) => prev.slice(1));
    setPendingReviewCount((c) => c + 1);

    try {
      await fetch(`/english/api/vocabulary/${wordId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quality }),
      });
    } catch (err) {
      console.error('Review sync error:', err);
    } finally {
      setPendingReviewCount((c) => Math.max(0, c - 1));
    }
  };

  const handleToggleFavorite = async (word) => {
    const nextState = !word.is_favorite;
    setWords((prev) => prev.map((w) => w.id === word.id ? { ...w, is_favorite: nextState ? 1 : 0 } : w));
    try {
      await fetch(`/english/api/vocabulary/${word.id}/favorite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: nextState }),
      });
    } catch (err) {
      console.error('Favorite toggle error:', err);
    }
  };

  const handleToggleLearned = async (word, isLearned) => {
    const learnedVal = isLearned !== undefined ? isLearned : !word.learned_permanently_at;
    setWords((prev) => prev.map((w) => w.id === word.id ? { ...w, learned_permanently_at: learnedVal ? new Date().toISOString() : null } : w));
    try {
      await fetch(`/english/api/vocabulary/${word.id}/learned-permanently`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learnedPermanently: learnedVal }),
      });
    } catch (err) {
      console.error('Learned toggle error:', err);
    }
  };

  const handleToggleWordGroup = async (word, groupId) => {
    const currentGroupIds = (word.groups || []).map((g) => g.id);
    const hasGroup = currentGroupIds.includes(groupId);
    const nextGroupIds = hasGroup ? currentGroupIds.filter((id) => id !== groupId) : [...currentGroupIds, groupId];
    const targetGroup = groups.find((g) => g.id === groupId);
    const nextGroups = hasGroup ? (word.groups || []).filter((g) => g.id !== groupId) : targetGroup ? [...(word.groups || []), targetGroup] : word.groups || [];

    setWords((items) => items.map((item) => item.id === word.id ? { ...item, groups: nextGroups } : item));

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
      setError(`Add word error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteWord = async (word) => {
    if (!confirm(`Delete "${word.word}"?`)) return;
    setWords((prev) => prev.filter((w) => w.id !== word.id));
    try {
      await fetch(`/english/api/vocabulary/${word.id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Delete word error:', err);
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
