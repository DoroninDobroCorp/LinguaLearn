import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, BookMarked, Check, Plus, RotateCcw, Star, Trash2, TrendingUp, Undo2, X } from 'lucide-react';
import { buildVocabularyRound, restoreVocabularyRound } from '../utils/vocabularyRounds';

const MODES = { due: 'Due now', once_all: 'All words — once each', favorites: 'Favorites only' };

function Vocabulary() {
  const [words, setWords] = useState([]);
  const [dueWords, setDueWords] = useState([]);
  const [studyQueue, setStudyQueue] = useState([]);
  const [studyMode, setStudyMode] = useState('due');
  const [roundTotal, setRoundTotal] = useState(0);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newWord, setNewWord] = useState({ word: '', translation: '', example: '' });
  const [filter, setFilter] = useState('active');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [pendingFavoriteIds, setPendingFavoriteIds] = useState(() => new Set());
  const [pendingLearnedIds, setPendingLearnedIds] = useState(() => new Set());
  const reviewingWordIdsRef = useRef(new Set());
  const favoriteMutationIdsRef = useRef(new Set());
  const learnedMutationIdsRef = useRef(new Set());
  const studySessionSaveChainRef = useRef(Promise.resolve());

  const activeWords = useMemo(() => words.filter((word) => !word.learned_permanently_at), [words]);
  const favoriteWords = useMemo(() => activeWords.filter((word) => Boolean(word.is_favorite)), [activeWords]);
  const learnedWords = useMemo(() => words.filter((word) => Boolean(word.learned_permanently_at)), [words]);
  const mastered = useMemo(() => activeWords.filter((word) => Number(word.level) >= 5).length, [activeWords]);
  const currentWord = studyQueue[0] || null;
  const completed = Math.max(0, roundTotal - studyQueue.length);

  const loadVocabulary = async ({ initializeDue = false } = {}) => {
    const [allResponse, dueResponse, sessionResponse] = await Promise.all([
      fetch('/english/api/vocabulary'),
      fetch('/english/api/vocabulary/due'),
      initializeDue ? fetch('/english/api/vocabulary/study-session') : Promise.resolve(null),
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
        setNotice(restored.queue.length ? `Resumed ${MODES[restored.mode]} round.` : `${MODES[restored.mode]} round is complete.`);
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
    if (mode !== 'once_all' && mode !== 'favorites') return Promise.resolve();
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
    if (!forceRestart && studyMode === mode && studyQueue.length > 0) {
      setShowTranslation(false);
      setNotice(`Continuing the saved ${MODES[mode]} round with ${studyQueue.length} words left.`);
      return;
    }

    let savedSession = null;
    if (!forceRestart && (mode === 'once_all' || mode === 'favorites')) {
      try {
        const response = await fetch(`/english/api/vocabulary/study-session?mode=${encodeURIComponent(mode)}`);
        if (response.ok) {
          const data = await response.json();
          savedSession = data.session;
          const restored = restoreVocabularyRound(words, savedSession);
          if (restored?.queue.length > 0) {
            setStudyMode(restored.mode);
            setStudyQueue(restored.queue);
            setRoundTotal(restored.roundTotal);
            setShowTranslation(false);
            setError('');
            setNotice(`Resumed ${MODES[restored.mode]} with ${restored.queue.length} words left.`);
            return;
          }
        }
      } catch (loadError) {
        setError(`Could not check the saved round: ${loadError.message}`);
        return;
      }
    }

    const queue = buildVocabularyRound(words, mode, dueWords);
    setStudyMode(mode);
    setStudyQueue(queue);
    setRoundTotal(queue.length);
    setShowTranslation(false);
    setError('');
    setNotice(queue.length ? `${MODES[mode]} round started.` : 'There are no words in this mode yet.');
    try {
      await persistStudySession(mode, queue, queue.length, { restart: forceRestart || Boolean(savedSession) });
    } catch (saveError) {
      setError(`Round started, but server save failed: ${saveError.message}`);
    }
  };

  const restartRound = (mode) => {
    if (!window.confirm(`Restart ${MODES[mode]}? Saved progress in the current round will be cleared.`)) return;
    startRound(mode, { forceRestart: true });
  };

  const apiMutation = async (url, options) => {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const addWord = async () => {
    if (!newWord.word.trim() || !newWord.translation.trim()) return;
    setBusy(true); setError('');
    try {
      await apiMutation('/english/api/vocabulary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newWord) });
      setNewWord({ word: '', translation: '', example: '' });
      setShowAddForm(false);
      await loadVocabulary();
      setNotice('Word added.');
    } catch (mutationError) { setError(mutationError.message); } finally { setBusy(false); }
  };

  const reviewWord = (quality) => {
    if (!currentWord) return;
    const reviewedWord = currentWord;
    if (reviewingWordIdsRef.current.has(reviewedWord.id)) return;
    reviewingWordIdsRef.current.add(reviewedWord.id);

    const nextQueue = studyQueue.slice(1);
    setStudyQueue(nextQueue);
    setShowTranslation(false);
    setError('');
    setPendingReviewCount((count) => count + 1);

    Promise.all([
      apiMutation(`/english/api/vocabulary/${reviewedWord.id}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quality }),
      }),
      persistStudySession(studyMode, nextQueue, roundTotal),
    ])
      .then(() => loadVocabulary())
      .catch((mutationError) => setError(`The next card is ready, but saving the previous answer failed: ${mutationError.message}`))
      .finally(() => {
        reviewingWordIdsRef.current.delete(reviewedWord.id);
        setPendingReviewCount((count) => Math.max(0, count - 1));
      });
  };

  const toggleFavorite = (word) => {
    const wordId = Number(word.id);
    if (favoriteMutationIdsRef.current.has(wordId)) return;
    favoriteMutationIdsRef.current.add(wordId);
    setPendingFavoriteIds((ids) => new Set(ids).add(wordId));
    setError('');

    const favorite = !Boolean(word.is_favorite);
    const patchFavorite = (item, value) => item.id === word.id ? { ...item, is_favorite: value ? 1 : 0 } : item;
    const nextQueue = studyQueue
      .map((item) => patchFavorite(item, favorite))
      .filter((item) => studyMode !== 'favorites' || item.is_favorite);
    setWords((items) => items.map((item) => patchFavorite(item, favorite)));
    setDueWords((items) => items.map((item) => patchFavorite(item, favorite)));
    setStudyQueue(nextQueue);
    setNotice(favorite ? 'Added to favorites. Saving…' : 'Removed from favorites. Saving…');

    Promise.all([
      apiMutation(`/english/api/vocabulary/${word.id}/favorite`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ favorite }),
      }),
      persistStudySession(studyMode, nextQueue, roundTotal),
    ])
      .then(() => loadVocabulary())
      .then(() => setNotice(favorite ? 'Added to favorites.' : 'Removed from favorites.'))
      .catch((mutationError) => {
        setWords((items) => items.map((item) => patchFavorite(item, !favorite)));
        setDueWords((items) => items.map((item) => patchFavorite(item, !favorite)));
        setStudyQueue((items) => items.map((item) => patchFavorite(item, !favorite)));
        setError(`Favorite changed instantly, but server save failed: ${mutationError.message}`);
      })
      .finally(() => {
        favoriteMutationIdsRef.current.delete(wordId);
        setPendingFavoriteIds((ids) => {
          const next = new Set(ids);
          next.delete(wordId);
          return next;
        });
      });
  };

  const setLearnedForever = (word, learned) => {
    if (learned && !window.confirm(`Mark “${word.word}” learned forever? You can restore it from the Learned list.`)) return;
    const wordId = Number(word.id);
    if (learnedMutationIdsRef.current.has(wordId)) return;
    learnedMutationIdsRef.current.add(wordId);
    setPendingLearnedIds((ids) => new Set(ids).add(wordId));
    setError('');

    const learnedAt = learned ? new Date().toISOString() : null;
    const patchLearned = (item, value) => item.id === word.id ? { ...item, learned_permanently_at: value } : item;
    const nextQueue = learned ? studyQueue.filter((item) => item.id !== word.id) : studyQueue;
    setWords((items) => items.map((item) => patchLearned(item, learnedAt)));
    setDueWords((items) => learned ? items.filter((item) => item.id !== word.id) : items.map((item) => patchLearned(item, null)));
    setStudyQueue(nextQueue);
    setShowTranslation(false);
    setNotice(learned ? 'Saved as learned forever. Syncing…' : 'Word restored. Syncing…');

    Promise.all([
      apiMutation(`/english/api/vocabulary/${word.id}/permanent-learned`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ learned }),
      }),
      persistStudySession(studyMode, nextQueue, roundTotal),
    ])
      .then(() => loadVocabulary())
      .then(() => setNotice(learned ? 'Saved as learned forever.' : 'Word restored to study queues.'))
      .catch((mutationError) => {
        setWords((items) => items.map((item) => patchLearned(item, word.learned_permanently_at || null)));
        setError(`The interface continued immediately, but saving “learned forever” failed: ${mutationError.message}`);
      })
      .finally(() => {
        learnedMutationIdsRef.current.delete(wordId);
        setPendingLearnedIds((ids) => {
          const next = new Set(ids);
          next.delete(wordId);
          return next;
        });
      });
  };

  const deleteWord = async (word) => {
    if (!window.confirm(`Delete “${word.word}” and all its progress?`)) return;
    setBusy(true); setError('');
    try {
      await apiMutation(`/english/api/vocabulary/${word.id}`, { method: 'DELETE' });
      const nextQueue = studyQueue.filter((item) => item.id !== word.id);
      setStudyQueue(nextQueue);
      await persistStudySession(studyMode, nextQueue, roundTotal);
      await loadVocabulary();
    } catch (mutationError) { setError(mutationError.message); } finally { setBusy(false); }
  };

  const visibleWords = filter === 'learned' ? learnedWords : filter === 'favorites' ? words.filter((word) => word.is_favorite) : filter === 'all' ? words : activeWords;
  const continuingAllRound = studyMode === 'once_all' && studyQueue.length > 0;
  const continuingFavoritesRound = studyMode === 'favorites' && studyQueue.length > 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-2xl p-6">
        <h2 className="text-3xl font-bold text-gray-800 mb-4 flex items-center"><BookMarked className="h-8 w-8 mr-3 text-indigo-600" />Vocabulary Practice</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[['Total', words.length], ['Active', activeWords.length], ['Due', dueWords.length], ['Favorites', words.filter((word) => word.is_favorite).length], ['Learned', learnedWords.length]].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-indigo-50 p-3"><p className="text-xs text-indigo-700">{label}</p><p className="text-2xl font-bold text-indigo-900">{value}</p></div>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3 mt-5">
          <button onClick={() => startRound('due')} className="rounded-xl bg-white border border-indigo-200 px-4 py-3 font-semibold text-indigo-700">Due now ({dueWords.length})</button>
          <button onClick={() => startRound('once_all')} className="rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white">{continuingAllRound ? `Continue all words (${studyQueue.length} left)` : `All words — once each (${activeWords.length})`}</button>
          <button onClick={() => startRound('favorites')} className="rounded-xl bg-amber-500 px-4 py-3 font-semibold text-white"><Star className="inline h-4 w-4 mr-1" />{continuingFavoritesRound ? `Continue favorites (${studyQueue.length} left)` : `Favorites only (${favoriteWords.length})`}</button>
        </div>
        <p className="mt-2 text-xs text-gray-500">Once-each rounds use a saved snapshot. Adding or deleting other words does not reset completed progress.</p>
        {(continuingAllRound || continuingFavoritesRound) && <button onClick={() => restartRound(studyMode)} className="mt-2 text-xs font-semibold text-red-600 hover:text-red-700">Restart this round from the beginning</button>}
        <button onClick={() => setShowAddForm((value) => !value)} className="mt-4 w-full px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2"><Plus className="h-5 w-5" />Add New Word</button>
      </div>

      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-700">{error}</div>}
      {notice && <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-700">{notice}</div>}

      {showAddForm && <div className="bg-white rounded-2xl shadow-2xl p-6 space-y-3">
        <input placeholder="English word" value={newWord.word} onChange={(event) => setNewWord({ ...newWord, word: event.target.value })} className="w-full px-4 py-3 border-2 border-indigo-300 rounded-xl" />
        <input placeholder="Translation" value={newWord.translation} onChange={(event) => setNewWord({ ...newWord, translation: event.target.value })} className="w-full px-4 py-3 border-2 border-indigo-300 rounded-xl" />
        <textarea placeholder="Example (optional)" value={newWord.example} onChange={(event) => setNewWord({ ...newWord, example: event.target.value })} className="w-full px-4 py-3 border-2 border-indigo-300 rounded-xl" />
        <button onClick={addWord} disabled={busy} className="w-full rounded-xl bg-green-500 px-4 py-3 font-semibold text-white disabled:opacity-50">Add Word</button>
      </div>}

      {currentWord ? <div className="bg-white rounded-2xl shadow-2xl p-8">
        <div className="mb-4"><p className="text-sm text-gray-500">{MODES[studyMode]} · {completed + 1} of {roundTotal}</p><p className="text-xs text-gray-500">{studyQueue.length} remaining{pendingReviewCount > 0 ? ` · Saving ${pendingReviewCount} answer${pendingReviewCount === 1 ? '' : 's'}…` : ''}</p></div>
        <div onClick={() => setShowTranslation((value) => !value)} className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-12 min-h-[280px] flex flex-col items-center justify-center cursor-pointer border-4 border-indigo-200">
          <p className="text-5xl font-bold text-indigo-900 mb-8">{currentWord.word}</p>
          {showTranslation ? <div className="text-center"><p className="text-3xl text-purple-800">{currentWord.translation}</p>{currentWord.example && <p className="text-lg text-gray-600 italic mt-4">“{currentWord.example}”</p>}</div> : <p className="text-gray-500">Click to reveal translation</p>}
        </div>
        {showTranslation && <div className="space-y-3 mt-5"><div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[[0, X, "Don't Know", 'bg-red-500'], [1, AlertCircle, 'Hard', 'bg-orange-500'], [2, Check, 'Good', 'bg-blue-500'], [3, TrendingUp, 'Easy', 'bg-green-500']].map(([quality, Icon, label, color]) => <button key={quality} onClick={() => reviewWord(quality)} className={`${color} rounded-xl p-3 font-semibold text-white`}><Icon className="h-5 w-5 mx-auto" />{label}</button>)}
          <button onClick={() => toggleFavorite(currentWord)} disabled={pendingFavoriteIds.has(Number(currentWord.id))} className={`rounded-xl border-2 p-3 font-semibold disabled:opacity-50 ${currentWord.is_favorite ? 'border-amber-500 bg-amber-100 text-amber-800' : 'border-amber-300 bg-white text-amber-700 hover:bg-amber-50'}`}><Star className={`h-5 w-5 mx-auto ${currentWord.is_favorite ? 'fill-current' : ''}`} />{currentWord.is_favorite ? 'Remove Favorite' : 'Add Favorite'}</button>
        </div><button onClick={() => setLearnedForever(currentWord, true)} disabled={pendingLearnedIds.has(Number(currentWord.id))} className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white disabled:opacity-50">Learned forever — remove from every study queue</button></div>}
      </div> : <div className="bg-white rounded-2xl shadow-2xl p-10 text-center"><RotateCcw className="h-14 w-14 mx-auto text-green-500" /><h3 className="text-2xl font-bold mt-3">Round complete</h3><p className="text-gray-600">Choose a mode above to start a new shuffled round.</p></div>}

      <div className="bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex flex-wrap gap-2 mb-4">{[['active', `Active (${activeWords.length})`], ['favorites', `Favorites (${words.filter((word) => word.is_favorite).length})`], ['learned', `Learned (${learnedWords.length})`], ['all', `All (${words.length})`]].map(([key, label]) => <button key={key} onClick={() => setFilter(key)} className={`rounded-full px-3 py-2 text-sm font-semibold ${filter === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{label}</button>)}</div>
        <p className="text-xs text-gray-500 mb-3">{mastered} active words have reached SRS level 5.</p>
        <div className="space-y-2 max-h-[34rem] overflow-y-auto">{visibleWords.map((word) => <div key={word.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gray-50 rounded-xl">
          <div><p className="font-bold text-gray-800 text-lg">{word.word} {word.is_favorite && <Star className="inline h-4 w-4 fill-amber-500 text-amber-500" />}</p><p className="text-gray-600">{word.translation}</p>{word.learned_permanently_at && <p className="text-xs font-semibold text-emerald-700">Learned forever</p>}</div>
          <div className="flex gap-2"><button onClick={() => toggleFavorite(word)} disabled={pendingFavoriteIds.has(Number(word.id))} title="Toggle favorite" className="p-2 rounded-lg bg-amber-50 text-amber-600 disabled:opacity-50"><Star className={`h-5 w-5 ${word.is_favorite ? 'fill-current' : ''}`} /></button>{word.learned_permanently_at ? <button onClick={() => setLearnedForever(word, false)} disabled={pendingLearnedIds.has(Number(word.id))} title="Restore to study" className="p-2 rounded-lg bg-emerald-50 text-emerald-700 disabled:opacity-50"><Undo2 className="h-5 w-5" /></button> : <button onClick={() => setLearnedForever(word, true)} disabled={pendingLearnedIds.has(Number(word.id))} title="Learned forever" className="p-2 rounded-lg bg-violet-50 text-violet-700 disabled:opacity-50"><Check className="h-5 w-5" /></button>}<button onClick={() => deleteWord(word)} disabled={busy} className="p-2 rounded-lg bg-red-50 text-red-600"><Trash2 className="h-5 w-5" /></button></div>
        </div>)}</div>
      </div>
    </div>
  );
}

export default Vocabulary;
