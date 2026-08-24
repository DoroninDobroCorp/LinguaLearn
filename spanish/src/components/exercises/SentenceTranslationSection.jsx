import React, { useState, useEffect } from 'react';
import { 
  Globe, Sparkles, RefreshCw, Volume2, HelpCircle, ArrowRight, ListOrdered, Check 
} from 'lucide-react';
import { profileApiUrl, profileFetch } from '../../utils/api';
import { soundEngine, speakSpanish } from '../../utils/soundEffects';

function normalizeSentence(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[¿?¡!.,;:«»"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripAccents(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function checkGrammarAnswerMatch(userText, correctText, altAnswers = []) {
  const normUser = normalizeSentence(userText);
  const normCorrect = normalizeSentence(correctText);
  if (normUser === normCorrect) return true;
  if (stripAccents(normUser) === stripAccents(normCorrect)) return true;

  if (Array.isArray(altAnswers)) {
    for (const alt of altAnswers) {
      if (normalizeSentence(alt) === normUser) return true;
      if (stripAccents(normalizeSentence(alt)) === stripAccents(normUser)) return true;
    }
  }

  return false;
}

export default function SentenceTranslationSection() {
  const [topics, setTopics] = useState([]);
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
    const fetchTopics = async () => {
      try {
        const res = await profileFetch(profileApiUrl('/spanish/api/curriculum/topics'));
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data.topics) ? data.topics : Array.isArray(data) ? data : [];
          setTopics(list);
          if (list.length > 0) {
            setSelectedTopicIds(list.slice(0, 4).map(t => t.id));
          }
        }
      } catch (err) {
        console.warn('Could not load topics for translation:', err);
      }
    };
    fetchTopics();
  }, []);

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
      const res = await profileFetch(profileApiUrl('/spanish/api/exercises/generate-translation'), {
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
      current.alternativeAnswers || current.alternativeTranslations || []
    );

    setIsCorrect(match);
    setShowResult(true);

    if (match) soundEngine.playCorrect();
    else soundEngine.playWrong();

    // Persist mistake in grammar memory or resolve upon correct translation
    try {
      if (!match) {
        profileFetch(profileApiUrl('/spanish/api/exercises/record-mistake'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicName: current.testedGrammar || 'Перевод предложений',
            category: 'translation',
            level: selectedLevel !== 'all' ? selectedLevel : 'A1',
            prompt: current.sourceSentence,
            userWrongAnswer: userTranslation.trim(),
            correctAnswer: current.targetSentence,
            ruleExplanation: current.explanation || ''
          })
        }).catch(() => {});
      } else {
        profileFetch(profileApiUrl('/spanish/api/exercises/resolve-mistake'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: 'translation',
            prompt: current.sourceSentence
          })
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('Mistake tracking error in SentenceTranslation:', e);
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
      {/* Topic Selector & Exam Launcher Bar 1-in-1 with ClassicQuiz */}
      <div className="max-w-4xl mx-auto p-6 rounded-3xl bg-gradient-to-br from-purple-50 via-white to-fuchsia-50 dark:from-gray-800 dark:via-gray-800 dark:to-purple-950/30 border-2 border-purple-200 dark:border-gray-700 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-purple-600 text-white font-black text-sm">
                🌐 Перевод предложений
              </span>
              <span className="text-xs font-bold text-purple-700 dark:text-purple-300">
                Выбрано тем: {selectedTopicIds.length}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Выберите любые темы курса для генерации аутентичных предложений для перевода с русского на испанский.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white dark:bg-gray-750 border border-purple-300 dark:border-gray-600 text-purple-700 dark:text-purple-300 font-bold text-xs focus:outline-none"
            >
              <option value="all">🌍 Все уровни</option>
              {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((lvl) => (
                <option key={lvl} value={lvl}>Уровень {lvl}</option>
              ))}
            </select>

            <button
              onClick={() => setShowTopicSelector(!showTopicSelector)}
              className="px-4 py-2 rounded-xl border border-purple-300 dark:border-gray-600 bg-white dark:bg-gray-750 text-purple-700 dark:text-purple-300 font-bold text-xs hover:bg-purple-50 transition-all flex items-center justify-center gap-1.5 shadow-sm"
            >
              <ListOrdered className="w-4 h-4" />
              <span>{showTopicSelector ? 'Скрыть выбор тем ▲' : `Выбрать темы (${selectedTopicIds.length}) ▼`}</span>
            </button>
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={() => fetchTranslations(selectedTopicIds)}
            disabled={loading}
            className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-black text-xs sm:text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-yellow-300" />
            <span>{loading ? 'Генерируем предложения ИИ...' : 'Сгенерировать 10 предложений ИИ ⚡'}</span>
          </button>
        </div>

        {/* Expandable Topic Selector */}
        {showTopicSelector && (
          <div className="pt-3 border-t border-purple-100 dark:border-gray-700 space-y-3 animate-fadeIn">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по темам..."
                className="w-full sm:w-64 px-3 py-1.5 rounded-xl border border-purple-200 dark:border-gray-600 dark:bg-gray-750 text-xs font-semibold text-gray-900 dark:text-white focus:outline-none"
              />

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={handleSelectFirstFour}
                  className="text-xs px-2.5 py-1 rounded-lg bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-bold hover:bg-purple-200"
                >
                  Первые 4 темы
                </button>
                <button
                  onClick={handleSelectAll}
                  className="text-xs px-2.5 py-1 rounded-lg bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-bold hover:bg-purple-200"
                >
                  {filteredTopics.length > 0 && filteredTopics.every(t => selectedTopicIds.includes(t.id)) ? 'Снять все' : `Выбрать все (${filteredTopics.length})`}
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
                        ? 'bg-purple-100 dark:bg-purple-900/60 border-purple-500 text-purple-900 dark:text-purple-200 shadow-sm font-bold'
                        : 'bg-white dark:bg-gray-750 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-purple-300'
                    }`}
                  >
                    <span className="truncate">{t.id}. {t.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center space-y-3">
          <RefreshCw className="h-8 w-8 text-purple-600 animate-spin mx-auto" />
          <p className="text-sm font-medium text-gray-500">Подготовка предложений для перевода через нейросеть...</p>
        </div>
      ) : current ? (
        <div className="max-w-4xl mx-auto glass-card rounded-3xl p-6 sm:p-10 shadow-2xl border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 animate-fadeIn space-y-6">
          <div className="flex items-center justify-between border-b border-purple-100 dark:border-gray-700 pb-4 text-xs font-bold text-gray-500">
            <span className="px-2.5 py-1 rounded-md bg-purple-100 text-purple-800">Предложение {currentIndex + 1} из {exercises.length}</span>
            <span>{current.testedGrammar || 'Грамматика'}</span>
          </div>

          <div className="p-6 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/40 dark:to-pink-950/40 border border-purple-200 dark:border-purple-800 space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">Переведите на испанский:</span>
            <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white leading-snug">
              {current.sourceSentence}
            </p>
          </div>

          <div className="space-y-2">
            <textarea
              rows="3"
              value={userTranslation}
              onChange={(e) => setUserTranslation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), !showResult ? handleCheck() : handleNext())}
              placeholder="Escribe la traducción en español..."
              disabled={showResult}
              className="w-full p-4 rounded-xl border-2 border-purple-200 dark:border-gray-600 dark:bg-gray-750 focus:border-purple-600 focus:outline-none text-base font-semibold text-gray-900 dark:text-white"
            />
            {current.hint && (
              <button
                type="button"
                onClick={() => setShowHint(!showHint)}
                className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span>{showHint ? `Подсказка: ${current.hint}` : 'Показать грамматическую подсказку'}</span>
              </button>
            )}
          </div>

          {showResult && (
            <div className={`p-4 rounded-xl border space-y-2 animate-fadeIn ${
              isCorrect ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700' : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`font-bold text-sm ${isCorrect ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300'}`}>
                  {isCorrect ? '✅ Верно! Отличный перевод' : '❌ Эталонный вариант перевода:'}
                </span>
                <button
                  type="button"
                  onClick={() => speakSpanish(current.targetSentence)}
                  className="p-1 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:text-purple-600 shadow-sm"
                  title="Озвучить на испанском"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
              </div>
              <p className="text-base font-bold text-gray-900 dark:text-white">{current.targetSentence}</p>
              {current.explanation && (
                <p className="text-xs text-gray-600 dark:text-gray-400 pt-1">💡 {current.explanation}</p>
              )}
            </div>
          )}

          <div className="flex justify-end">
            {!showResult ? (
              <button
                onClick={handleCheck}
                disabled={!userTranslation.trim()}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold rounded-xl shadow-md text-sm"
              >
                Проверить перевод
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="px-6 py-3 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold rounded-xl shadow-lg text-sm flex items-center gap-2"
              >
                <span>{currentIndex + 1 >= exercises.length ? 'Завершить раунд 🏆' : 'Следующее предложение'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto text-center py-12 space-y-3 glass-card rounded-3xl border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 shadow-xl">
          <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-300 flex items-center justify-center mx-auto text-2xl font-bold">
            🌐
          </div>
          <h4 className="text-lg font-bold text-gray-800 dark:text-white">Выберите темы и нажмите «Сгенерировать 10 предложений ИИ ⚡»</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
            Нейросеть подготовит контекстные предложения для перевода на испанский язык с проверкой синонимов и учетом прошлых ошибок.
          </p>
        </div>
      )}
    </div>
  );
}
