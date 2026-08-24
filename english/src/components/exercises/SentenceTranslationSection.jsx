import React, { useState } from 'react';
import { 
  Globe, Sparkles, RefreshCw, Volume2, HelpCircle, ArrowRight 
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
  const [loading, setLoading] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState('all');
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [exercises, setExercises] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userTranslation, setUserTranslation] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);

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
      const res = await fetch('/english/api/exercises/generate-translation', {
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
      current.alternativeTranslations || []
    );

    setIsCorrect(match);
    setShowResult(true);

    if (match) soundEngine.playCorrect();
    else soundEngine.playWrong();
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
    <div className="bg-white rounded-3xl shadow-xl p-6 sm:p-8 space-y-6 border border-gray-100 animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <div>
          <h3 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
            <Globe className="h-6 w-6 text-indigo-600" />
            <span>Перевод предложений</span>
          </h3>
          <p className="text-xs text-gray-500">Переводите аутентичные предложения с русского на английский.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedLevel}
            onChange={(e) => {
              setSelectedLevel(e.target.value);
              setSelectedTopic('all');
            }}
            className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs sm:text-sm font-bold text-gray-800 focus:outline-none"
          >
            <option value="all">🌍 Все уровни (A1–C2)</option>
            {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((lvl) => (
              <option key={lvl} value={lvl}>Уровень {lvl}</option>
            ))}
          </select>

          <select
            value={selectedTopic}
            onChange={(e) => setSelectedTopic(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs sm:text-sm font-semibold text-gray-800 max-w-xs truncate focus:outline-none"
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
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
            <span>{loading ? 'Генерируем...' : 'Сгенерировать ⚡'}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center space-y-3">
          <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin mx-auto" />
          <p className="text-sm font-medium text-gray-500">Подготовка предложений для перевода...</p>
        </div>
      ) : current ? (
        <div className="space-y-6">
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
                <span>{showHint ? `Подсказка: ${current.hint}` : 'Показать грамматическую подсказку'}</span>
              </button>
            )}
          </div>

          {showResult && (
            <div className={`p-4 rounded-xl border space-y-2 animate-fadeIn ${
              isCorrect ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-300'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`font-bold text-sm ${isCorrect ? 'text-emerald-800' : 'text-rose-800'}`}>
                  {isCorrect ? '✅ Верно! Отличный перевод' : '❌ Эталонный вариант перевода:'}
                </span>
                <button
                  type="button"
                  onClick={() => speakEnglish(current.targetSentence)}
                  className="p-1 rounded bg-white text-gray-700 hover:text-indigo-600 shadow-sm"
                  title="Озвучить на английском"
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
                Проверить перевод
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl shadow-lg text-sm flex items-center gap-2"
              >
                <span>{currentIndex + 1 >= exercises.length ? 'Завершить раунд 🏆' : 'Следующее предложение'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 space-y-3">
          <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto text-2xl font-bold">
            🌐
          </div>
          <h4 className="text-lg font-bold text-gray-800">Выберите тему и нажмите «Сгенерировать ⚡»</h4>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            ИИ подготовит контекстные предложения для перевода на английский язык с проверкой синонимов.
          </p>
        </div>
      )}
    </div>
  );
}
