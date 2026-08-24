import React, { useState, useEffect } from 'react';
import { 
  Globe, Sparkles, RefreshCw, Volume2, HelpCircle, ArrowRight 
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
  const [loading, setLoading] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState('all');
  const [selectedTopic, setSelectedTopic] = useState('all');
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
        }
      } catch (err) {
        console.warn('Could not load topics for translation:', err);
      }
    };
    fetchTopics();
  }, []);

  const filteredTopics = selectedLevel === 'all' 
    ? topics 
    : topics.filter(t => t.level === selectedLevel);

  const fetchTranslations = async () => {
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
          topicId: selectedTopic !== 'all' ? selectedTopic : undefined
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
    <div className="max-w-4xl mx-auto glass-card rounded-3xl p-6 sm:p-10 shadow-2xl border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 animate-fadeIn space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-100 dark:border-gray-700 pb-4">
        <div>
          <h3 className="text-xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
            <Globe className="h-6 w-6 text-fuchsia-600 dark:text-fuchsia-400" />
            <span>Перевод предложений</span>
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Переводите аутентичные предложения с русского на испанский.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedLevel}
            onChange={(e) => {
              setSelectedLevel(e.target.value);
              setSelectedTopic('all');
            }}
            className="px-3 py-2 rounded-xl bg-white dark:bg-gray-700 border border-purple-200 dark:border-gray-600 text-xs sm:text-sm font-bold text-gray-900 dark:text-white focus:outline-none"
          >
            <option value="all">🌍 Все уровни (A1–C2)</option>
            {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((lvl) => (
              <option key={lvl} value={lvl}>Уровень {lvl}</option>
            ))}
          </select>

          <select
            value={selectedTopic}
            onChange={(e) => setSelectedTopic(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-gray-700 border border-purple-200 dark:border-gray-600 text-xs sm:text-sm font-semibold text-gray-900 dark:text-white max-w-xs truncate focus:outline-none"
          >
            <option value="all">
              {selectedLevel === 'all' ? '🎯 Все темы курса' : `🎯 Все темы уровня ${selectedLevel}`}
            </option>
            {filteredTopics.map((t) => (
              <option key={t.id} value={t.id}>
                {selectedLevel === 'all' ? `${t.level}: ${t.name}` : t.name}
              </option>
            ))}
          </select>

          <button
            onClick={fetchTranslations}
            disabled={loading}
            className="px-4 py-2 bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
            <span>{loading ? 'Генерируем...' : 'Сгенерировать ⚡'}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center space-y-3">
          <RefreshCw className="h-8 w-8 text-purple-600 animate-spin mx-auto" />
          <p className="text-sm font-medium text-gray-500">Подготовка предложений для перевода...</p>
        </div>
      ) : current ? (
        <div className="space-y-6">
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
        <div className="text-center py-12 space-y-3">
          <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-300 flex items-center justify-center mx-auto text-2xl font-bold">
            🌐
          </div>
          <h4 className="text-lg font-bold text-gray-800 dark:text-white">Выберите тему и нажмите «Сгенерировать ⚡»</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
            ИИ подготовит контекстные предложения для перевода на испанский язык с проверкой синонимов.
          </p>
        </div>
      )}
    </div>
  );
}
