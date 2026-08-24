import React, { useState, useEffect } from 'react';
import { 
  Globe, Sparkles, RefreshCw, Volume2, HelpCircle, ArrowRight, ListOrdered, Check 
} from 'lucide-react';
import { soundEngine, speakEnglish } from '../../utils/soundEffects';

function normalizeSentence(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[.,;:!?¡¿"'«»()—–\-_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function checkGrammarAnswerMatch(userText, correctText, altAnswers = []) {
  const normUser = normalizeSentence(userText);
  const normCorrect = normalizeSentence(correctText);
  if (normUser === normCorrect) return true;
  
  if (Array.isArray(altAnswers)) {
    for (const alt of altAnswers) {
      if (normalizeSentence(alt) === normUser) return true;
    }
  }

  return false;
}

export default function SentenceTranslationSection({ topics = [], onTopicUpdated }) {
  const [selectedTopicIds, setSelectedTopicIds] = useState([1, 2, 3, 4]);
  const [showTopicSelector, setShowTopicSelector] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('all');
  const [loading, setLoading] = useState(false);
  const [exercises, setExercises] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userTranslation, setUserTranslation] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (Array.isArray(topics) && topics.length > 0 && selectedTopicIds.length === 0) {
      setSelectedTopicIds(topics.slice(0, 4).map(t => t.id));
    }
  }, [topics]);

  const filteredTopics = topics.filter(t => {
    const matchesLevel = selectedLevel === 'all' || t.level === selectedLevel;
    const matchesSearch = !searchQuery.trim() || t.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  const toggleTopic = (id) => {
    setSelectedTopicIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectFirstFour = () => {
    const subset = filteredTopics.slice(0, 4).map(t => t.id);
    setSelectedTopicIds(subset);
  };

  const handleSelectAll = () => {
    const currentFilteredIds = filteredTopics.map(t => t.id);
    const allSelected = currentFilteredIds.length > 0 && currentFilteredIds.every(id => selectedTopicIds.includes(id));
    if (allSelected) {
      setSelectedTopicIds(prev => prev.filter(id => !currentFilteredIds.includes(id)));
    } else {
      setSelectedTopicIds(prev => Array.from(new Set([...prev, ...currentFilteredIds])));
    }
  };

  const fetchTranslations = async (targetTopicIds = selectedTopicIds) => {
    setLoading(true);
    setShowResult(false);
    setUserTranslation('');
    setShowHint(false);
    setCurrentIndex(0);

    try {
      const res = await fetch('/english/api/exercises/generate-translation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: selectedLevel !== 'all' ? selectedLevel : undefined,
          topicIds: targetTopicIds.length > 0 ? targetTopicIds : undefined
        })
      });
      const data = await res.json();
      setExercises(data.exercises || []);
    } catch (err) {
      console.error('Error generating translations:', err);
    } finally {
      setLoading(false);
    }
  };

  const current = exercises[currentIndex] || null;

  const handleCheck = () => {
    if (!current || showResult || !userTranslation.trim()) return;

    const match = checkGrammarAnswerMatch(
      userTranslation,
      current.targetSentence,
      current.alternativeTranslations || []
    );

    setIsCorrect(match);
    setShowResult(true);

    if (match) soundEngine.playCorrect();
    else soundEngine.playWrong();

    // Persist mistake in grammar memory or resolve upon correct translation
    try {
      if (!match) {
        fetch('/english/api/exercises/record-mistake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicName: current.testedGrammar || 'Sentence Translation',
            category: 'translation',
            level: selectedLevel !== 'all' ? selectedLevel : 'A1',
            prompt: current.sourceSentence,
            userWrongAnswer: userTranslation.trim(),
            correctAnswer: current.targetSentence,
            ruleExplanation: current.explanation || ''
          })
        }).catch(() => {});
      } else {
        fetch('/english/api/exercises/resolve-mistake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: 'translation',
            prompt: current.sourceSentence
          })
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('Mistake tracking error in English SentenceTranslation:', e);
    }
  };

  const handleNext = () => {
    if (currentIndex + 1 < exercises.length) {
      setCurrentIndex((prev) => prev + 1);
      setUserTranslation('');
      setShowResult(false);
      setShowHint(false);
    } else {
      setExercises([]);
      setCurrentIndex(0);
    }
  };

  return (
    <div className="space-y-6">
      {/* Topic Selector Bar 1-to-1 with ClassicQuiz */}
      <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100 space-y-4 animate-fadeIn">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-600 text-white font-black text-sm">
                🌐 Sentence Translation
              </span>
              <span className="text-xs font-bold text-indigo-700">
                Selected topics: {selectedTopicIds.length}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Translate authentic sentences from Russian to English with AI feedback, grammar explanations, and mistake tracking.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs sm:text-sm font-bold text-gray-800 focus:outline-none"
            >
              <option value="all">🌍 All levels</option>
              {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((lvl) => (
                <option key={lvl} value={lvl}>Level {lvl}</option>
              ))}
            </select>

            <button
              onClick={() => setShowTopicSelector(!showTopicSelector)}
              className="px-4 py-2 rounded-xl border border-gray-200 bg-gray-50 text-indigo-700 font-bold text-xs hover:bg-indigo-50 transition-all flex items-center justify-center gap-1.5 shadow-sm"
            >
              <ListOrdered className="w-4 h-4" />
              <span>{showTopicSelector ? 'Hide topics ▲' : `Select topics (${selectedTopicIds.length}) ▼`}</span>
            </button>
          </div>
        </div>

        {/* Action Button Row */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={() => fetchTranslations(selectedTopicIds)}
            disabled={loading}
            className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black text-xs sm:text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-yellow-300" />
            <span>{loading ? 'Generating AI sentences...' : 'Generate 10 AI Sentences ⚡'}</span>
          </button>
        </div>

        {/* Expandable Topic Selector */}
        {showTopicSelector && (
          <div className="pt-3 border-t border-gray-100 space-y-3 animate-fadeIn">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search topics..."
                className="w-full sm:w-64 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-900 focus:outline-none"
              />

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={handleSelectFirstFour}
                  className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold hover:bg-indigo-100"
                >
                  First 4 topics
                </button>
                <button
                  onClick={handleSelectAll}
                  className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold hover:bg-indigo-100"
                >
                  {filteredTopics.length > 0 && filteredTopics.every(t => selectedTopicIds.includes(t.id)) ? 'Deselect all' : `Select all (${filteredTopics.length})`}
                </button>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-1">
              {filteredTopics.map((t) => {
                const isSelected = selectedTopicIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTopic(t.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2 text-xs font-semibold ${
                      isSelected
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-sm font-bold'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'
                    }`}
                  >
                    <span className="truncate">{t.id}. {t.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center space-y-3">
          <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin mx-auto" />
          <p className="text-sm font-medium text-gray-500">Preparing translation sentences with AI...</p>
        </div>
      ) : current ? (
        <div className="bg-white rounded-3xl shadow-xl p-6 sm:p-8 space-y-6 border border-gray-100 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4 text-xs font-bold text-gray-500">
            <span className="px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-800">Sentence {currentIndex + 1} of {exercises.length}</span>
            <span>{current.testedGrammar || 'Grammar'}</span>
          </div>

          <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Переведите на английский:</span>
            <p className="text-lg sm:text-xl font-bold text-gray-900 leading-snug">
              {current.sourceSentence}
            </p>
          </div>

          <div className="space-y-2">
            <textarea
              rows="3"
              value={userTranslation}
              onChange={(e) => setUserTranslation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), !showResult ? handleCheck() : handleNext())}
              placeholder="Type your translation in English..."
              disabled={showResult}
              className="w-full p-4 rounded-xl border-2 border-gray-200 focus:border-indigo-600 focus:outline-none text-base font-semibold"
            />
            {current.hint && (
              <button
                type="button"
                onClick={() => setShowHint(!showHint)}
                className="text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span>{showHint ? `Hint: ${current.hint}` : 'Show grammar hint'}</span>
              </button>
            )}
          </div>

          {showResult && (
            <div className={`p-4 rounded-xl border space-y-2 animate-fadeIn ${
              isCorrect ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-300'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`font-bold text-sm ${isCorrect ? 'text-emerald-800' : 'text-rose-800'}`}>
                  {isCorrect ? '✅ Correct! Excellent translation' : '❌ Target translation:'}
                </span>
                <button
                  type="button"
                  onClick={() => speakEnglish(current.targetSentence)}
                  className="p-1 rounded bg-white text-gray-700 hover:text-indigo-600 shadow-sm"
                  title="Speak English"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
              </div>
              <p className="text-base font-bold text-gray-900">{current.targetSentence}</p>
              {current.explanation && (
                <p className="text-xs text-gray-600 pt-1">💡 {current.explanation}</p>
              )}
            </div>
          )}

          <div className="flex justify-end">
            {!showResult ? (
              <button
                onClick={handleCheck}
                disabled={!userTranslation.trim()}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold rounded-xl shadow-md text-sm"
              >
                Check Translation
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl shadow-lg text-sm flex items-center gap-2"
              >
                <span>{currentIndex + 1 >= exercises.length ? 'Finish round 🏆' : 'Next sentence'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 space-y-3 bg-white rounded-3xl p-6 shadow-xl border border-gray-100">
          <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto text-2xl font-bold">
            🌐
          </div>
          <h4 className="text-lg font-bold text-gray-800">Select topics and click «Generate 10 AI Sentences ⚡»</h4>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            AI will generate context-rich sentences to translate with synonym matching, grammar explanations, and mistake tracking.
          </p>
        </div>
      )}
    </div>
  );
}
