import React, { useEffect, useMemo, useState } from 'react';
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

  const persistStudySession = async (mode, queue, total) => {
    if (mode !== 'once_all' && mode !== 'favorites') return;
    await apiMutation('/english/api/vocabulary/study-session', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, queueIds: queue.map((word) => Number(word.id)), roundTotal: total }),
    });
  };

  const startRound = async (mode) => {
    const queue = buildVocabularyRound(words, mode, dueWords);
    setStudyMode(mode);
    setStudyQueue(queue);
    setRoundTotal(queue.length);
    setShowTranslation(false);
    setError('');
    setNotice(queue.length ? `${MODES[mode]} round started.` : 'There are no words in this mode yet.');
    try {
      await persistStudySession(mode, queue, queue.length);
    } catch (saveError) {
      setError(`Round started, but server save failed: ${saveError.message}`);
    }
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

  const finishCurrent = async () => {
    const nextQueue = studyQueue.slice(1);
    setStudyQueue(nextQueue);
    setShowTranslation(false);
    await persistStudySession(studyMode, nextQueue, roundTotal);
  };

  const reviewWord = async (quality) => {
    if (!currentWord) return;
    setBusy(true); setError('');
    try {
      await apiMutation(`/english/api/vocabulary/${currentWord.id}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quality }),
      });
      await finishCurrent();
      await loadVocabulary();
    } catch (mutationError) { setError(mutationError.message); } finally { setBusy(false); }
  };

  const toggleFavorite = async (word) => {
    setBusy(true); setError('');
    try {
      const favorite = !Boolean(word.is_favorite);
      await apiMutation(`/english/api/vocabulary/${word.id}/favorite`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ favorite }),
      });
      const nextQueue = studyQueue
        .map((item) => item.id === word.id ? { ...item, is_favorite: favorite ? 1 : 0 } : item)
        .filter((item) => studyMode !== 'favorites' || item.is_favorite);
      setStudyQueue(nextQueue);
      await persistStudySession(studyMode, nextQueue, roundTotal);
      await loadVocabulary();
    } catch (mutationError) { setError(mutationError.message); } finally { setBusy(false); }
  };

  const setLearnedForever = async (word, learned) => {
    if (learned && !window.confirm(`Mark “${word.word}” learned forever? You can restore it from the Learned list.`)) return;
    setBusy(true); setError('');
    try {
      await apiMutation(`/english/api/vocabulary/${word.id}/permanent-learned`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ learned }),
      });
      const nextQueue = studyQueue.filter((item) => item.id !== word.id);
      setStudyQueue(nextQueue);
      await persistStudySession(studyMode, nextQueue, roundTotal);
      setShowTranslation(false);
      await loadVocabulary();
      setNotice(learned ? 'Saved as learned forever.' : 'Word restored to study queues.');
    } catch (mutationError) { setError(mutationError.message); } finally { setBusy(false); }
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
          <button onClick={() => startRound('once_all')} className="rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white">All words — once each ({activeWords.length})</button>
          <button onClick={() => startRound('favorites')} className="rounded-xl bg-amber-500 px-4 py-3 font-semibold text-white"><Star className="inline h-4 w-4 mr-1" />Favorites only ({favoriteWords.length})</button>
        </div>
        <p className="mt-2 text-xs text-gray-500">Once-each rounds use a shuffled snapshot, so no word repeats before the whole queue is complete.</p>
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
        <div className="flex justify-between gap-3 mb-4"><div><p className="text-sm text-gray-500">{MODES[studyMode]} · {completed + 1} of {roundTotal}</p><p className="text-xs text-gray-500">{studyQueue.length} remaining</p></div><button onClick={() => toggleFavorite(currentWord)} disabled={busy} className={`rounded-full p-2 ${currentWord.is_favorite ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}><Star className={`h-5 w-5 ${currentWord.is_favorite ? 'fill-current' : ''}`} /></button></div>
        <div onClick={() => setShowTranslation((value) => !value)} className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-12 min-h-[280px] flex flex-col items-center justify-center cursor-pointer border-4 border-indigo-200">
          <p className="text-5xl font-bold text-indigo-900 mb-8">{currentWord.word}</p>
          {showTranslation ? <div className="text-center"><p className="text-3xl text-purple-800">{currentWord.translation}</p>{currentWord.example && <p className="text-lg text-gray-600 italic mt-4">“{currentWord.example}”</p>}</div> : <p className="text-gray-500">Click to reveal translation</p>}
        </div>
        {showTranslation && <div className="space-y-3 mt-5"><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[[0, X, "Don't Know", 'bg-red-500'], [1, AlertCircle, 'Hard', 'bg-orange-500'], [2, Check, 'Good', 'bg-blue-500'], [3, TrendingUp, 'Easy', 'bg-green-500']].map(([quality, Icon, label, color]) => <button key={quality} onClick={() => reviewWord(quality)} disabled={busy} className={`${color} rounded-xl p-3 font-semibold text-white disabled:opacity-50`}><Icon className="h-5 w-5 mx-auto" />{label}</button>)}
        </div><button onClick={() => setLearnedForever(currentWord, true)} disabled={busy} className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white">Learned forever — remove from every study queue</button></div>}
      </div> : <div className="bg-white rounded-2xl shadow-2xl p-10 text-center"><RotateCcw className="h-14 w-14 mx-auto text-green-500" /><h3 className="text-2xl font-bold mt-3">Round complete</h3><p className="text-gray-600">Choose a mode above to start a new shuffled round.</p></div>}

      <div className="bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex flex-wrap gap-2 mb-4">{[['active', `Active (${activeWords.length})`], ['favorites', `Favorites (${words.filter((word) => word.is_favorite).length})`], ['learned', `Learned (${learnedWords.length})`], ['all', `All (${words.length})`]].map(([key, label]) => <button key={key} onClick={() => setFilter(key)} className={`rounded-full px-3 py-2 text-sm font-semibold ${filter === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{label}</button>)}</div>
        <p className="text-xs text-gray-500 mb-3">{mastered} active words have reached SRS level 5.</p>
        <div className="space-y-2 max-h-[34rem] overflow-y-auto">{visibleWords.map((word) => <div key={word.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gray-50 rounded-xl">
          <div><p className="font-bold text-gray-800 text-lg">{word.word} {word.is_favorite && <Star className="inline h-4 w-4 fill-amber-500 text-amber-500" />}</p><p className="text-gray-600">{word.translation}</p>{word.learned_permanently_at && <p className="text-xs font-semibold text-emerald-700">Learned forever</p>}</div>
          <div className="flex gap-2"><button onClick={() => toggleFavorite(word)} disabled={busy} title="Toggle favorite" className="p-2 rounded-lg bg-amber-50 text-amber-600"><Star className={`h-5 w-5 ${word.is_favorite ? 'fill-current' : ''}`} /></button>{word.learned_permanently_at ? <button onClick={() => setLearnedForever(word, false)} disabled={busy} title="Restore to study" className="p-2 rounded-lg bg-emerald-50 text-emerald-700"><Undo2 className="h-5 w-5" /></button> : <button onClick={() => setLearnedForever(word, true)} disabled={busy} title="Learned forever" className="p-2 rounded-lg bg-violet-50 text-violet-700"><Check className="h-5 w-5" /></button>}<button onClick={() => deleteWord(word)} disabled={busy} className="p-2 rounded-lg bg-red-50 text-red-600"><Trash2 className="h-5 w-5" /></button></div>
        </div>)}</div>
      </div>
    </div>
  );
}

export default Vocabulary;
