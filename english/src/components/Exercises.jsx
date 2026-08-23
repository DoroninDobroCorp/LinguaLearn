import React, { useState, useEffect, useRef } from 'react';
import { 
  Brain, RefreshCw, CheckCircle, XCircle, Award, 
  Layers, Infinity as InfinityIcon, Globe, Check, Search,
  Zap, Clock, Sparkles, ArrowRight, Target, Volume2, HelpCircle,
  Trophy, ListOrdered
} from 'lucide-react';
import ExamModal from './ExamModal';
import { soundEngine, speakEnglish } from '../utils/soundEffects';
import { 
  createVerbDrillQuestion, 
  isVerbDrillAnswerCorrect, 
  DRILL_TYPES, 
  DRILL_PRONOUN_MODES 
} from '../utils/verbDrills';

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

// ----------------------------------------------------
// 1. CLASSIC QUIZ & AI-POWERED EXERCISES & EXAMS
// ----------------------------------------------------
function ClassicQuizSection({ allTopics = [], onTopicUpdated }) {
  const [selectedLevel, setSelectedLevel] = useState('A1');
  const [availableTopics, setAvailableTopics] = useState([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showTopicSelector, setShowTopicSelector] = useState(false);

  const [exercises, setExercises] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [userFillAnswer, setUserFillAnswer] = useState('');
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [error, setError] = useState('');
  const [scoreFeedback, setScoreFeedback] = useState('');
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  // Exam Modal State
  const [examModalConfig, setExamModalConfig] = useState({
    isOpen: false,
    level: 'A1',
    examType: 'custom',
    topicIds: []
  });

  // Filter topics for the selected level
  useEffect(() => {
    const levelTopics = allTopics.filter(t => t.level === selectedLevel);
    setAvailableTopics(levelTopics);
    if (levelTopics.length > 0) {
      // Default to first 4 topics of the level
      const initialIds = levelTopics.slice(0, 4).map(t => t.id);
      setSelectedTopicIds(initialIds);
    } else {
      setSelectedTopicIds([]);
    }
  }, [selectedLevel, allTopics]);

  const toggleTopic = (id) => {
    setSelectedTopicIds(prev => {
      const numId = Number(id);
      if (prev.includes(numId)) {
        const next = prev.filter(x => x !== numId);
        return next.length > 0 ? next : prev; // keep at least 1
      } else {
        return [...prev, numId];
      }
    });
  };

  const handleSelectAll = () => {
    setSelectedTopicIds(availableTopics.map(t => t.id));
  };

  const handleSelectFirstFour = () => {
    setSelectedTopicIds(availableTopics.slice(0, 4).map(t => t.id));
  };

  const generateAiExercises = async () => {
    if (selectedTopicIds.length === 0) return;
    setIsGeneratingAi(true);
    setError('');
    setIsAnswered(false);
    setSelectedOption(null);
    setUserFillAnswer('');
    setScoreFeedback('');
    setStats({ correct: 0, total: 0 });

    try {
      const res = await fetch('/english/api/exercises/generate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: selectedLevel,
          topicIds: selectedTopicIds,
          count: 10
        })
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.exercises) && data.exercises.length > 0) {
        setExercises(data.exercises);
        setCurrentIndex(0);
        soundEngine.playVictory();
      } else {
        throw new Error(data.error || 'Не удалось сгенерировать упражнения');
      }
    } catch (err) {
      console.error('Error generating exercises:', err);
      setError(err.message || 'Ошибка генерации упражнений');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const currentEx = exercises[currentIndex] || null;
  const isChoice = currentEx?.type === 'multiple-choice' || currentEx?.type === 'choice' || Boolean(currentEx?.options?.length);
  const userAnswer = isChoice ? selectedOption : userFillAnswer.trim();

  const handleCheck = async () => {
    if (isAnswered || !currentEx || !userAnswer) return;

    let correct = false;
    if (isChoice) {
      correct = (String(userAnswer || '').trim().toLowerCase() === String(currentEx.correctAnswer || '').trim().toLowerCase());
    } else {
      correct = checkGrammarAnswerMatch(
        userAnswer,
        currentEx.correctAnswer,
        currentEx.alternativeAnswers || []
      );
    }

    setIsCorrect(correct);
    setIsAnswered(true);
    setStats(prev => ({ correct: prev.correct + (correct ? 1 : 0), total: prev.total + 1 }));

    if (correct) soundEngine.playCorrect();
    else soundEngine.playWrong();

    try {
      const resp = await fetch('/english/api/topics/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: currentEx.topic,
          level: currentEx.level || selectedLevel,
          success: correct
        })
      });
      if (resp.ok) {
        const result = await resp.json();
        if (result.feedback) setScoreFeedback(result.feedback);
        if (onTopicUpdated) onTopicUpdated();
      }
    } catch (err) {
      console.error('Error updating progress:', err);
    }
  };

  const handleNext = () => {
    if (currentIndex + 1 < exercises.length) {
      setCurrentIndex(i => i + 1);
      setSelectedOption(null);
      setUserFillAnswer('');
      setIsAnswered(false);
      setIsCorrect(false);
      setScoreFeedback('');
    } else {
      // Completed round
      setExercises([]);
      setCurrentIndex(0);
    }
  };

  const filteredTopics = availableTopics.filter(t => 
    !searchQuery.trim() || 
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* 1. TOPIC SELECTOR & EXAM LAUNCHER BAR */}
      <div className="max-w-4xl mx-auto p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-purple-50 via-white to-pink-50 border-2 border-purple-200 shadow-xl space-y-4 animate-fadeIn">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-purple-600 text-white font-black text-sm flex items-center gap-1.5 shadow-sm">
                <Brain className="h-4 w-4" />
                <span>ИИ-Тренажер & Экзамены</span>
              </span>
              <span className="text-xs font-bold text-purple-700 bg-purple-100 px-3 py-1 rounded-full">
                Выбрано тем: {selectedTopicIds.length}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Выберите любые темы курса для точечной тренировки или запуска официального экзамена от ИИ.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Level Selector */}
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white border-2 border-purple-300 font-bold text-xs text-purple-900 shadow-sm"
            >
              {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(lvl => (
                <option key={lvl} value={lvl}>Уровень {lvl}</option>
              ))}
            </select>

            <button
              onClick={() => setShowTopicSelector(!showTopicSelector)}
              className="px-3.5 py-2 rounded-xl border-2 border-purple-300 bg-white text-purple-700 font-bold text-xs hover:bg-purple-50 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <ListOrdered className="w-4 h-4" />
              <span>{showTopicSelector ? 'Скрыть выбор тем ▲' : `Выбрать темы (${selectedTopicIds.length}) ▼`}</span>
            </button>
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={generateAiExercises}
            disabled={isGeneratingAi || selectedTopicIds.length === 0}
            className="flex-1 min-w-[200px] py-3.5 px-4 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-black text-xs sm:text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isGeneratingAi ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-yellow-200" />
                <span>Генерируем вопросы ИИ...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-yellow-300" />
                <span>Сгенерировать 10 вопросов ИИ ⚡</span>
              </>
            )}
          </button>

          <button
            onClick={() => setExamModalConfig({
              isOpen: true,
              level: selectedLevel,
              examType: 'custom',
              topicIds: selectedTopicIds
            })}
            disabled={selectedTopicIds.length === 0}
            className="py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-black text-xs sm:text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Target className="w-4 h-4" />
            <span>Свой экзамен (20 вопр.) 🎯</span>
          </button>

          <button
            onClick={() => setExamModalConfig({
              isOpen: true,
              level: selectedLevel,
              examType: 'level_mastery',
              topicIds: []
            })}
            className="py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black text-xs sm:text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Trophy className="w-4 h-4 text-yellow-200" />
            <span>Аттестация {selectedLevel} (30 вопр.) 🏆</span>
          </button>
        </div>

        {/* EXPANDABLE TOPIC SELECTOR */}
        {showTopicSelector && (
          <div className="pt-4 border-t border-purple-200 space-y-3 animate-fadeIn">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по темам уровня..."
                className="w-full sm:w-72 px-3.5 py-2 rounded-xl border border-purple-300 text-xs font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
              />

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={handleSelectFirstFour}
                  className="text-xs px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 font-bold hover:bg-purple-200"
                >
                  Первые 4 темы
                </button>
                <button
                  onClick={handleSelectAll}
                  className="text-xs px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 font-bold hover:bg-purple-200"
                >
                  Выбрать все ({availableTopics.length})
                </button>
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-1">
              {filteredTopics.map((t) => {
                const isSelected = selectedTopicIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTopic(t.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2 text-xs font-semibold ${
                      isSelected
                        ? 'bg-purple-100 border-purple-500 text-purple-900 shadow-sm font-bold'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-purple-300'
                    }`}
                  >
                    <span className="truncate">{t.name}</span>
                    {isSelected && <Check className="w-4 h-4 text-purple-600 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold">
            {error}
          </div>
        )}
      </div>

      {/* 2. ACTIVE EXERCISE QUESTION CARD */}
      {currentEx && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-gray-100 space-y-6 animate-fadeIn">
          {/* Header progress */}
          <div className="flex items-center justify-between border-b border-gray-100 pb-4 text-xs font-bold text-gray-500">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-md bg-purple-100 text-purple-800">
                {currentEx.level || selectedLevel}
              </span>
              <span className="text-gray-800">{currentEx.topic}</span>
            </div>
            <span>Вопрос {currentIndex + 1} из {exercises.length}</span>
          </div>

          {/* Question text */}
          <div className="p-6 rounded-2xl bg-purple-50 border border-purple-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-700">
                {isChoice ? 'Выберите правильный вариант:' : 'Заполните пропуск / введите форму:'}
              </span>
              <button
                type="button"
                onClick={() => speakEnglish(currentEx.question)}
                className="p-1.5 rounded-lg bg-white text-purple-600 hover:bg-purple-100 shadow-sm"
                title="Озвучить"
              >
                <Volume2 className="h-4 w-4" />
              </button>
            </div>
            <p className="text-lg sm:text-xl font-bold text-gray-900 leading-relaxed whitespace-pre-line">
              {currentEx.question}
            </p>
          </div>

          {/* Input Area */}
          {isChoice ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentEx.options?.map((opt, idx) => {
                const isSelected = selectedOption === opt;
                let btnStyle = 'bg-white border-gray-200 hover:border-purple-400 text-gray-800';
                if (isAnswered) {
                  if (opt === currentEx.correctAnswer) {
                    btnStyle = 'bg-emerald-50 border-emerald-500 text-emerald-900 font-bold';
                  } else if (isSelected) {
                    btnStyle = 'bg-rose-50 border-rose-500 text-rose-900';
                  } else {
                    btnStyle = 'opacity-40 border-gray-200';
                  }
                } else if (isSelected) {
                  btnStyle = 'bg-purple-50 border-purple-600 text-purple-900 font-bold ring-2 ring-purple-300';
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => !isAnswered && setSelectedOption(opt)}
                    disabled={isAnswered}
                    className={`p-4 rounded-xl border-2 text-left font-medium text-sm sm:text-base transition-all flex items-center justify-between ${btnStyle}`}
                  >
                    <span>{opt}</span>
                    {isAnswered && opt === currentEx.correctAnswer && <Check className="h-5 w-5 text-emerald-600" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <input
              type="text"
              value={userFillAnswer}
              onChange={(e) => setUserFillAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (!isAnswered ? handleCheck() : handleNext())}
              placeholder="Введите ответ на английском..."
              disabled={isAnswered}
              className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-200 focus:border-purple-600 text-base font-semibold outline-none"
            />
          )}

          {/* Feedback & Explanation */}
          {isAnswered && (
            <div className={`p-4 rounded-xl border space-y-1.5 animate-fadeIn ${
              isCorrect ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-300'
            }`}>
              <p className={`font-bold text-sm ${isCorrect ? 'text-emerald-800' : 'text-rose-800'}`}>
                {isCorrect ? '✅ Верно! Отличный результат' : `❌ Правильный ответ: ${currentEx.correctAnswer}`}
              </p>
              {currentEx.explanation && (
                <p className="text-xs sm:text-sm text-gray-700 pt-1 leading-relaxed">
                  💡 {currentEx.explanation}
                </p>
              )}
              {scoreFeedback && (
                <p className="text-xs font-semibold text-purple-700 pt-1">
                  📈 {scoreFeedback}
                </p>
              )}
            </div>
          )}

          {/* Controls */}
          <div className="flex justify-end pt-2">
            {!isAnswered ? (
              <button
                onClick={handleCheck}
                disabled={!userAnswer}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold rounded-xl shadow-md text-sm transition-all"
              >
                Проверить ответ
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl shadow-lg text-sm flex items-center gap-2"
              >
                <span>{currentIndex + 1 >= exercises.length ? 'Завершить раунд 🏆' : 'Следующий вопрос'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Exam Modal */}
      {examModalConfig.isOpen && (
        <ExamModal
          isOpen={examModalConfig.isOpen}
          level={examModalConfig.level}
          examType={examModalConfig.examType}
          topicIds={examModalConfig.topicIds}
          onClose={() => setExamModalConfig(prev => ({ ...prev, isOpen: false }))}
          onExamFinished={() => {
            if (onTopicUpdated) onTopicUpdated();
          }}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------
// 2. SENTENCE TRANSLATION (RUSSIAN -> ENGLISH)
// ----------------------------------------------------
function SentenceTranslationExerciseSection({ topics, onTopicUpdated }) {
  const [loading, setLoading] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [exercises, setExercises] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userTranslation, setUserTranslation] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);

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

        <div className="flex items-center gap-2">
          <select
            value={selectedTopic}
            onChange={(e) => setSelectedTopic(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs sm:text-sm font-semibold text-gray-800"
          >
            <option value="all">🎯 Все темы курса</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>{t.level}: {t.name}</option>
            ))}
          </select>

          <button
            onClick={fetchTranslations}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center gap-1.5"
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

// ----------------------------------------------------
// 3. WORD TILES (CONSTRUCTOR DE FRASES)
// ----------------------------------------------------
function WordTilesSection() {
  const [items, setItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedTiles, setSelectedTiles] = useState([]);
  const [availableTiles, setAvailableTiles] = useState([]);
  const [showHint, setShowHint] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await fetch('/english/api/exercises/word-tiles');
      if (res.ok) {
        const data = await res.json();
        const list = data.items || [];
        setItems(list);
        if (list.length > 0) loadQuestion(list[0]);
      }
    } catch (err) {
      console.error('Error fetching word tiles:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadQuestion = (item) => {
    const shuffled = [...item.tiles].map((tText, idx) => ({ id: `${idx}_${tText}`, text: tText })).sort(() => 0.5 - Math.random());
    setAvailableTiles(shuffled);
    setSelectedTiles([]);
    setShowHint(false);
    setIsSubmitted(false);
    setIsCorrect(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const currentItem = items[currentIndex];

  const handleTileClick = (tile) => {
    if (isSubmitted) return;
    soundEngine.playTileClick();
    setAvailableTiles(prev => prev.filter(t => t.id !== tile.id));
    setSelectedTiles(prev => [...prev, tile]);
  };

  const handleRemoveTile = (tile) => {
    if (isSubmitted) return;
    soundEngine.playTileClick();
    setSelectedTiles(prev => prev.filter(t => t.id !== tile.id));
    setAvailableTiles(prev => [...prev, tile]);
  };

  const handleVerify = async () => {
    if (isSubmitted || selectedTiles.length === 0 || !currentItem) return;
    const userSentence = selectedTiles.map(t => t.text).join(' ');

    try {
      const res = await fetch('/english/api/exercises/word-tiles/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: currentItem.id, userSentence })
      });

      if (res.ok) {
        const data = await res.json();
        setIsSubmitted(true);
        setIsCorrect(data.isCorrect);
        if (data.isCorrect) soundEngine.playCorrect();
        else soundEngine.playWrong();
      }
    } catch (err) {
      console.error('Error verifying word tiles:', err);
    }
  };

  const handleNext = () => {
    const nextIdx = (currentIndex + 1) % items.length;
    setCurrentIndex(nextIdx);
    loadQuestion(items[nextIdx]);
  };

  if (loading || !currentItem) {
    return <div className="p-8 text-center text-gray-500">Загрузка конструктора предложений...</div>;
  }

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-xl border border-gray-100 space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div>
          <span className="text-xs font-bold bg-purple-100 text-purple-800 px-2.5 py-1 rounded-full">
            {currentItem.level}
          </span>
          <h3 className="text-xl font-extrabold text-gray-900 mt-1 flex items-center gap-2">
            <span>🧩 Word Tiles (Конструктор фраз)</span>
          </h3>
          <p className="text-xs text-gray-500">Соберите предложение на английском из перемешанных карточек-слов.</p>
        </div>
        <span className="text-sm font-bold text-purple-600">{currentIndex + 1} / {items.length}</span>
      </div>

      <div className="p-6 rounded-2xl bg-purple-50 border border-purple-200 space-y-1">
        <span className="text-xs font-bold uppercase tracking-wider text-purple-700">Переведите на английский:</span>
        <p className="text-lg font-bold text-gray-900 leading-snug">{currentItem.prompt}</p>
      </div>

      {/* Selected Workspace */}
      <div className="min-h-[100px] p-4 rounded-2xl border-2 border-dashed border-purple-300 bg-gray-50 flex flex-wrap items-center gap-2">
        {selectedTiles.length === 0 ? (
          <span className="text-sm text-gray-400 font-medium">Нажимайте на слова внизу, чтобы составить фразу...</span>
        ) : (
          selectedTiles.map((tile) => (
            <button
              key={tile.id}
              onClick={() => handleRemoveTile(tile)}
              disabled={isSubmitted}
              className="px-3.5 py-2 rounded-xl bg-purple-600 text-white font-bold text-sm shadow-md hover:bg-purple-700 active:scale-95 transition-all"
            >
              {tile.text}
            </button>
          ))
        )}
      </div>

      {/* Available Tiles */}
      <div className="flex flex-wrap gap-2 pt-2">
        {availableTiles.map((tile) => (
          <button
            key={tile.id}
            onClick={() => handleTileClick(tile)}
            disabled={isSubmitted}
            className="px-3.5 py-2 rounded-xl bg-white border-2 border-gray-200 hover:border-purple-400 text-gray-800 font-semibold text-sm shadow-sm active:scale-95 transition-all"
          >
            {tile.text}
          </button>
        ))}
      </div>

      {isSubmitted && (
        <div className={`p-4 rounded-xl border space-y-2 animate-fadeIn ${
          isCorrect ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-300'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`font-bold text-sm ${isCorrect ? 'text-emerald-800' : 'text-rose-800'}`}>
              {isCorrect ? '✅ Отлично! Предложение собрано верно' : '❌ Правильный вариант:'}
            </span>
            <button
              type="button"
              onClick={() => speakEnglish(currentItem.correctSentence)}
              className="p-1 rounded bg-white text-gray-700 hover:text-purple-600 shadow-sm"
              title="Озвучить"
            >
              <Volume2 className="h-4 w-4" />
            </button>
          </div>
          <p className="text-base font-bold text-gray-900">{currentItem.correctSentence}</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        {currentItem.hint ? (
          <button
            type="button"
            onClick={() => setShowHint(!showHint)}
            className="text-xs font-semibold text-purple-600 hover:underline"
          >
            {showHint ? `💡 ${currentItem.hint}` : 'Показать подсказку'}
          </button>
        ) : <div />}

        {!isSubmitted ? (
          <button
            onClick={handleVerify}
            disabled={selectedTiles.length === 0}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold rounded-xl shadow-md text-sm"
          >
            Проверить сборку
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl shadow-lg text-sm flex items-center gap-2"
          >
            <span>Следующая фраза</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// 4. SPEED MATCH BLITZ
// ----------------------------------------------------
function SpeedMatchSection() {
  const [pairs, setPairs] = useState([]);
  const [enCards, setEnCards] = useState([]);
  const [ruCards, setRuCards] = useState([]);
  const [selectedEn, setSelectedEn] = useState(null);
  const [selectedRu, setSelectedRu] = useState(null);
  const [matchedIds, setMatchedIds] = useState(new Set());
  const [timeLeft, setTimeLeft] = useState(30);
  const [combo, setCombo] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [score, setScore] = useState(0);

  const startRound = async () => {
    try {
      const res = await fetch('/english/api/exercises/speed-match');
      if (res.ok) {
        const data = await res.json();
        const rawPairs = data.pairs || [];
        setPairs(rawPairs);

        const enList = rawPairs.map((p, i) => ({ id: i, text: p.left })).sort(() => 0.5 - Math.random());
        const ruList = rawPairs.map((p, i) => ({ id: i, text: p.right })).sort(() => 0.5 - Math.random());

        setEnCards(enList);
        setRuCards(ruList);
        setMatchedIds(new Set());
        setSelectedEn(null);
        setSelectedRu(null);
        setTimeLeft(30);
        setCombo(1);
        setScore(0);
        setIsPlaying(true);
        setIsGameOver(false);
      }
    } catch (err) {
      console.error('Error starting speed match:', err);
    }
  };

  useEffect(() => {
    let timer;
    if (isPlaying && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(tVal => {
          if (tVal <= 1) {
            setIsPlaying(false);
            setIsGameOver(true);
            soundEngine.playWrong();
            return 0;
          }
          return tVal - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isPlaying, timeLeft]);

  const handleCardClick = (type, card) => {
    if (!isPlaying || matchedIds.has(card.id)) return;
    soundEngine.playTileClick();

    if (type === 'en') {
      if (selectedRu) {
        if (selectedRu.id === card.id) {
          soundEngine.playCombo(combo);
          const nextMatched = new Set(matchedIds);
          nextMatched.add(card.id);
          setMatchedIds(nextMatched);
          setScore(s => s + (10 * combo));
          setCombo(c => c + 1);
          setSelectedEn(null);
          setSelectedRu(null);

          if (nextMatched.size === pairs.length) {
            setIsPlaying(false);
            setIsGameOver(true);
            soundEngine.playVictory();
          }
        } else {
          soundEngine.playWrong();
          setCombo(1);
          setSelectedEn(null);
          setSelectedRu(null);
        }
      } else {
        setSelectedEn(card);
      }
    } else {
      if (selectedEn) {
        if (selectedEn.id === card.id) {
          soundEngine.playCombo(combo);
          const nextMatched = new Set(matchedIds);
          nextMatched.add(card.id);
          setMatchedIds(nextMatched);
          setScore(s => s + (10 * combo));
          setCombo(c => c + 1);
          setSelectedEn(null);
          setSelectedRu(null);

          if (nextMatched.size === pairs.length) {
            setIsPlaying(false);
            setIsGameOver(true);
            soundEngine.playVictory();
          }
        } else {
          soundEngine.playWrong();
          setCombo(1);
          setSelectedEn(null);
          setSelectedRu(null);
        }
      } else {
        setSelectedRu(card);
      }
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-xl border border-gray-100 animate-fadeIn">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
        <div>
          <h3 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-500" />
            Speed Match Blitz
          </h3>
          <p className="text-xs text-gray-500">Сопоставляйте пары слов до истечения 30 секунд.</p>
        </div>

        {isPlaying && (
          <div className="flex items-center space-x-4">
            <div className="px-3 py-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white font-extrabold text-sm rounded-full shadow animate-pulse">
              Combo x{combo} 🔥
            </div>
            <div className="flex items-center space-x-1.5 font-mono text-lg font-bold text-purple-600">
              <Clock className="w-5 h-5" />
              <span>{timeLeft}s</span>
            </div>
          </div>
        )}
      </div>

      {!isPlaying && !isGameOver && (
        <div className="text-center py-12 space-y-4">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center mx-auto text-4xl shadow-xl">
            ⚡
          </div>
          <h4 className="text-2xl font-extrabold text-gray-900">Готовы к спринту на скорость?</h4>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            У вас есть 30 секунд, чтобы найти все 6 пар. Держите комбо для максимального счета!
          </p>
          <button
            onClick={startRound}
            className="px-8 py-3.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-extrabold text-base rounded-2xl shadow-xl transition-transform active:scale-95"
          >
            Начать раунд 🚀
          </button>
        </div>
      )}

      {isPlaying && (
        <div className="grid grid-cols-2 gap-4 sm:gap-6 my-6">
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-purple-600 text-center">🇬🇧 English</div>
            {enCards.map((card) => {
              const isMatched = matchedIds.has(card.id);
              const isSelected = selectedEn?.id === card.id;
              if (isMatched) return <div key={card.id} className="h-14 opacity-0 pointer-events-none" />;

              return (
                <button
                  key={card.id}
                  onClick={() => handleCardClick('en', card)}
                  className={`w-full h-14 px-4 rounded-2xl font-bold text-sm sm:text-base border-2 shadow-sm transition-all flex items-center justify-center text-center ${
                    isSelected ? 'bg-purple-600 text-white border-purple-600 scale-105' : 'bg-white border-gray-200 text-gray-800 hover:border-purple-400'
                  }`}
                >
                  {card.text}
                </button>
              );
            })}
          </div>

          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-indigo-600 text-center">🇷🇺 Русский</div>
            {ruCards.map((card) => {
              const isMatched = matchedIds.has(card.id);
              const isSelected = selectedRu?.id === card.id;
              if (isMatched) return <div key={card.id} className="h-14 opacity-0 pointer-events-none" />;

              return (
                <button
                  key={card.id}
                  onClick={() => handleCardClick('ru', card)}
                  className={`w-full h-14 px-4 rounded-2xl font-bold text-sm sm:text-base border-2 shadow-sm transition-all flex items-center justify-center text-center ${
                    isSelected ? 'bg-indigo-600 text-white border-indigo-600 scale-105' : 'bg-white border-gray-200 text-gray-800 hover:border-indigo-400'
                  }`}
                >
                  {card.text}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isGameOver && (
        <div className="text-center py-8 space-y-4 animate-fadeIn">
          <h4 className="text-2xl font-black text-gray-900">Раунд завершен!</h4>
          <p className="text-lg font-bold text-purple-600">Набрано очков: {score}</p>
          <button
            onClick={startRound}
            className="px-6 py-3 bg-purple-600 text-white font-bold rounded-xl shadow-md"
          >
            Сыграть еще раз 🔄
          </button>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 5. ERROR DETECTIVE (GRAMMAR ERROR CORRECTION)
// ----------------------------------------------------
function ErrorDetectiveSection() {
  const [items, setItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedFix, setSelectedFix] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [ruleExplanation, setRuleExplanation] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await fetch('/english/api/exercises/error-detective');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Error fetching error detective:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const currentItem = items[currentIndex];

  const handleSelectOption = async (option) => {
    if (isSubmitted || !currentItem) return;
    setSelectedFix(option);
    soundEngine.playTileClick();

    try {
      const res = await fetch('/english/api/exercises/error-detective/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: currentItem.id, chosenOption: option })
      });

      if (res.ok) {
        const data = await res.json();
        setIsSubmitted(true);
        setRuleExplanation(data.ruleExplanation);
        if (data.isCorrect) soundEngine.playCorrect();
        else soundEngine.playWrong();
      }
    } catch (err) {
      console.error('Error verifying error detective:', err);
    }
  };

  const handleNext = () => {
    const nextIdx = (currentIndex + 1) % items.length;
    setCurrentIndex(nextIdx);
    setSelectedFix(null);
    setIsSubmitted(false);
    setRuleExplanation('');
  };

  if (loading || !currentItem) {
    return <div className="p-8 text-center text-gray-500">Загрузка детектора ошибок...</div>;
  }

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-xl border border-gray-100 space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div>
          <span className="text-xs font-bold bg-purple-100 text-purple-800 px-2.5 py-1 rounded-full">
            {currentItem.level}
          </span>
          <h3 className="text-xl font-extrabold text-gray-900 mt-1">
            🔍 Детектив грамматических ошибок
          </h3>
          <p className="text-xs text-gray-500">Найдите и выберите правильное исправление ошибки в предложении.</p>
        </div>
        <span className="text-sm font-bold text-purple-600">{currentIndex + 1} / {items.length}</span>
      </div>

      <div className="p-6 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200">
        <span className="text-xs font-bold uppercase tracking-wider text-purple-700">Предложение с ошибкой:</span>
        <p className="text-lg font-semibold text-gray-900 leading-relaxed mt-1">
          {currentItem.sentence}
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Какой вариант исправления правильный?
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {currentItem.options.map((opt, idx) => {
            let btnStyle = 'bg-white border-gray-200 hover:border-purple-400 text-gray-800';
            if (isSubmitted) {
              if (opt === currentItem.correctWord) {
                btnStyle = 'bg-emerald-50 border-emerald-500 text-emerald-900 font-bold';
              } else if (opt === selectedFix) {
                btnStyle = 'bg-rose-50 border-rose-500 text-rose-900';
              } else {
                btnStyle = 'opacity-40 border-gray-200';
              }
            }

            return (
              <button
                key={idx}
                onClick={() => handleSelectOption(opt)}
                disabled={isSubmitted}
                className={`p-4 text-left rounded-xl border-2 font-semibold text-sm transition-all shadow-sm ${btnStyle}`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {isSubmitted && (
        <div className="p-5 rounded-2xl bg-purple-50 border border-purple-200 space-y-1 animate-fadeIn">
          <div className="font-bold text-sm text-purple-900 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-purple-600" />
            Объяснение правила:
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{ruleExplanation}</p>
        </div>
      )}

      {isSubmitted && (
        <div className="flex justify-end pt-2">
          <button
            onClick={handleNext}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl shadow-lg text-sm flex items-center gap-2"
          >
            <span>Следующее задание</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 6. VERB DRILLS (IRREGULAR & TENSES TRAINER)
// ----------------------------------------------------
function VerbConjugationDrills() {
  const [drillType, setDrillType] = useState('past_simple');
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [stats, setStats] = useState({ correct: 0, completed: 0 });

  const loadQuestion = () => {
    setCurrentQuestion(createVerbDrillQuestion(drillType));
    setAnswer('');
    setShowResult(false);
    setIsCorrect(false);
  };

  useEffect(() => {
    loadQuestion();
  }, [drillType]);

  const handleCheck = () => {
    if (!currentQuestion || showResult || !answer.trim()) return;
    const correct = isVerbDrillAnswerCorrect(answer, currentQuestion.correctAnswer);
    setIsCorrect(correct);
    setShowResult(true);
    setStats(prev => ({
      correct: prev.correct + (correct ? 1 : 0),
      completed: prev.completed + 1
    }));

    if (correct) soundEngine.playCorrect();
    else soundEngine.playWrong();
  };

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-xl border border-gray-100 space-y-6 animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h3 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
            <Target className="w-6 h-6 text-purple-600" />
            <span>Тренажер глагольных форм и времен</span>
          </h3>
          <p className="text-xs text-gray-500">Отработка 2-й и 3-й форм неправильных глаголов, окончаний -s и -ing.</p>
        </div>

        <select
          value={drillType}
          onChange={(e) => setDrillType(e.target.value)}
          className="px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-800"
        >
          {Object.entries(DRILL_TYPES).map(([id, info]) => (
            <option key={id} value={id}>{info.title}</option>
          ))}
        </select>
      </div>

      {currentQuestion && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-purple-50 border border-purple-200 space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-700">Вопрос:</span>
            <p className="text-lg sm:text-xl font-bold text-gray-900">{currentQuestion.prompt}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {currentQuestion.options.map((opt, idx) => (
              <button
                key={idx}
                onClick={() => {
                  if (!showResult) {
                    setAnswer(opt);
                    const correct = isVerbDrillAnswerCorrect(opt, currentQuestion.correctAnswer);
                    setIsCorrect(correct);
                    setShowResult(true);
                    setStats(prev => ({ correct: prev.correct + (correct ? 1 : 0), completed: prev.completed + 1 }));
                    if (correct) soundEngine.playCorrect();
                    else soundEngine.playWrong();
                  }
                }}
                disabled={showResult}
                className={`p-4 rounded-xl border-2 font-bold text-base transition-all ${
                  showResult
                    ? isVerbDrillAnswerCorrect(opt, currentQuestion.correctAnswer)
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                      : opt === answer
                      ? 'bg-rose-50 border-rose-500 text-rose-900'
                      : 'opacity-40 border-gray-200'
                    : 'bg-white border-gray-200 hover:border-purple-400 text-gray-800'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>

          {showResult && (
            <div className={`p-4 rounded-xl border space-y-1 animate-fadeIn ${
              isCorrect ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-300'
            }`}>
              <p className="font-bold text-sm text-gray-900">
                {isCorrect ? '✅ Правильно!' : `❌ Правильный ответ: ${currentQuestion.correctAnswer}`}
              </p>
              <p className="text-xs text-gray-600">{currentQuestion.explanation}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-bold text-gray-400">
              Счет: {stats.correct} / {stats.completed}
            </span>

            <button
              onClick={loadQuestion}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-md text-sm flex items-center gap-2"
            >
              <span>Следующий глагол</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// MAIN EXERCISES CONTAINER COMPONENT (ALL 6 MODES)
// ----------------------------------------------------
export default function Exercises() {
  const [activeTab, setActiveTab] = useState('grammar');
  const [topics, setTopics] = useState([]);

  useEffect(() => {
    loadTopics();
  }, []);

  const loadTopics = async () => {
    try {
      const response = await fetch('/english/api/curriculum');
      const data = await response.json();
      setTopics(data.topics || []);
    } catch (error) {
      console.error('Error loading topics:', error);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 6 Full Gamified Mode Selector Tabs */}
      <div className="bg-white p-2 rounded-2xl shadow-md grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 border-2 border-gray-100 text-xs sm:text-sm">
        <button
          onClick={() => setActiveTab('grammar')}
          className={`py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'grammar' ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Brain className="h-4 w-4" />
          <span>Грамматика</span>
        </button>

        <button
          onClick={() => setActiveTab('translation')}
          className={`py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'translation' ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Globe className="h-4 w-4" />
          <span>Перевод</span>
        </button>

        <button
          onClick={() => setActiveTab('word-tiles')}
          className={`py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'word-tiles' ? 'bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Конструктор</span>
        </button>

        <button
          onClick={() => setActiveTab('speed-match')}
          className={`py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'speed-match' ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Zap className="h-4 w-4" />
          <span>Спринт</span>
        </button>

        <button
          onClick={() => setActiveTab('detective')}
          className={`py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'detective' ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Search className="h-4 w-4" />
          <span>Детектив</span>
        </button>

        <button
          onClick={() => setActiveTab('verbs')}
          className={`py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'verbs' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Target className="h-4 w-4" />
          <span>Глаголы</span>
        </button>
      </div>

      {activeTab === 'grammar' && (
        <ClassicQuizSection allTopics={topics} onTopicUpdated={loadTopics} />
      )}

      {activeTab === 'translation' && (
        <SentenceTranslationExerciseSection topics={topics} onTopicUpdated={loadTopics} />
      )}

      {activeTab === 'word-tiles' && (
        <WordTilesSection />
      )}

      {activeTab === 'speed-match' && (
        <SpeedMatchSection />
      )}

      {activeTab === 'detective' && (
        <ErrorDetectiveSection />
      )}

      {activeTab === 'verbs' && (
        <VerbConjugationDrills />
      )}
    </div>
  );
}
