import React, { useState, useEffect, useRef } from 'react';
import { 
  Brain, Target, RefreshCw, CheckCircle, XCircle, Award, 
  TrendingUp, Play, RotateCcw, HelpCircle, Flame, Layers, 
  Infinity as InfinityIcon, Globe, Check, Search, Filter, ShieldCheck
} from 'lucide-react';
import { profileApiUrl, profileFetch } from '../utils/api';
import TopicTheoryModal from './TopicTheoryModal';
import { BookOpen } from 'lucide-react';
import { parseExerciseTag } from '../utils/exerciseParser';
import {
  createVerbDrillQuestion,
  DRILL_PRONOUN_MODES,
  DRILL_RUN_MODES,
  DRILL_TYPES,
  getVerbDrillDisplayAnswer,
  getVerbDrillProgressTopic,
  isVerbDrillAnswerCorrect,
  isVerbDrillFinished,
} from '../utils/verbDrills';

// Clean text for flexible comparison
function normalizeSentence(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[¿?¡!.,;:«»"']/g, '')
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

  const stripAccents = str => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (stripAccents(normUser) === stripAccents(normCorrect)) return true;
  if (Array.isArray(altAnswers)) {
    for (const alt of altAnswers) {
      if (stripAccents(normalizeSentence(alt)) === stripAccents(normUser)) return true;
    }
  }

  return false;
}

// ----------------------------------------------------
// 1. VERB CONJUGATION DRILLS COMPONENT (FIRST TAB)
// ----------------------------------------------------
function VerbConjugationDrills({ onTopicUpdated }) {
  const [drillType, setDrillType] = useState('regular');
  const [pronounMode, setPronounMode] = useState('all');
  const [runMode, setRunMode] = useState('ten');
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [stats, setStats] = useState({ correct: 0, incorrect: 0, completed: 0 });

  const resetSession = (nextDrillType = drillType, nextRunMode = runMode, nextPronounMode = pronounMode) => {
    setDrillType(nextDrillType);
    setRunMode(nextRunMode);
    setPronounMode(nextPronounMode);
    setCurrentQuestion(null);
    setAnswer('');
    setShowResult(false);
    setIsCorrect(false);
    setSessionActive(false);
    setStats({ correct: 0, incorrect: 0, completed: 0 });
  };

  const startSession = () => {
    setStats({ correct: 0, incorrect: 0, completed: 0 });
    setCurrentQuestion(createVerbDrillQuestion(drillType, pronounMode));
    setAnswer('');
    setShowResult(false);
    setIsCorrect(false);
    setSessionActive(true);
  };

  const checkDrillAnswer = async () => {
    if (!currentQuestion || showResult || !answer.trim()) return;

    const correct = isVerbDrillAnswerCorrect(answer, currentQuestion);
    const nextStats = {
      correct: stats.correct + (correct ? 1 : 0),
      incorrect: stats.incorrect + (correct ? 0 : 1),
      completed: stats.completed + 1,
    };

    setIsCorrect(correct);
    setStats(nextStats);
    setShowResult(true);

    try {
      await profileFetch(profileApiUrl('/spanish/api/topics/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: getVerbDrillProgressTopic(currentQuestion),
          category: 'Practice',
          level: DRILL_TYPES[drillType].level,
          success: correct,
        }),
      });
      if (typeof onTopicUpdated === 'function') {
        onTopicUpdated();
      }
    } catch (error) {
      console.error('Error updating verb drill topic:', error);
    }
  };

  const nextQuestion = () => {
    if (isVerbDrillFinished(runMode, stats.completed)) {
      setSessionActive(false);
      return;
    }

    setCurrentQuestion(createVerbDrillQuestion(drillType, pronounMode));
    setAnswer('');
    setShowResult(false);
    setIsCorrect(false);
  };

  const finished = isVerbDrillFinished(runMode, stats.completed);
  const total = stats.correct + stats.incorrect;
  const accuracy = total === 0 ? 0 : Math.round((stats.correct / total) * 100);
  const rules = DRILL_TYPES[drillType].rules;

  return (
    <section className="bg-white rounded-2xl shadow-xl p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 flex items-center">
            <Target className="h-7 w-7 mr-3 text-fuchsia-600" />
            Verb Conjugation Practice
          </h2>
          <p className="text-gray-600 mt-2 text-sm sm:text-base">
            Practice present-tense conjugations. Supports standard <span className="font-semibold text-purple-700">tú</span>, Argentine <span className="font-semibold text-fuchsia-700">vos</span>, and Spanish <span className="font-semibold text-indigo-700">vosotros</span>.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 min-w-full lg:min-w-[360px]">
          <div className="bg-pink-100 rounded-xl p-3">
            <p className="text-xs font-semibold text-pink-700">Tasks</p>
            <p className="text-2xl font-bold text-pink-950">{stats.completed}</p>
          </div>
          <div className="bg-green-100 rounded-xl p-3">
            <p className="text-xs font-semibold text-green-700">Correct</p>
            <p className="text-2xl font-bold text-green-950">{stats.correct}</p>
          </div>
          <div className="bg-violet-100 rounded-xl p-3">
            <p className="text-xs font-semibold text-violet-700">Accuracy</p>
            <p className="text-2xl font-bold text-violet-950">{accuracy}%</p>
          </div>
        </div>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Глагольный тренажёр</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(DRILL_TYPES).map(([type, config]) => (
              <button
                key={type}
                type="button"
                onClick={() => resetSession(type, runMode, pronounMode)}
                className={`px-3 py-2.5 rounded-xl border-2 font-bold transition-all text-xs text-center ${
                  drillType === type
                    ? 'bg-fuchsia-500 border-fuchsia-600 text-white shadow-md'
                    : 'bg-white border-pink-200 text-gray-800 hover:border-pink-400'
                }`}
              >
                {config.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Диалект / Местоимения</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(DRILL_PRONOUN_MODES).map(([mode, config]) => (
              <button
                key={mode}
                type="button"
                onClick={() => resetSession(drillType, runMode, mode)}
                className={`px-3 py-2.5 rounded-xl border-2 font-bold transition-all text-xs text-center ${
                  pronounMode === mode
                    ? 'bg-purple-500 border-purple-600 text-white shadow-md'
                    : 'bg-white border-purple-200 text-gray-800 hover:border-purple-400'
                }`}
              >
                {config.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Режим сессии</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(DRILL_RUN_MODES).map(([mode, config]) => (
              <button
                key={mode}
                type="button"
                onClick={() => resetSession(drillType, mode, pronounMode)}
                className={`px-3 py-2.5 rounded-xl border-2 font-bold transition-all text-xs text-center ${
                  runMode === mode
                    ? 'bg-indigo-500 border-indigo-600 text-white shadow-md'
                    : 'bg-white border-indigo-200 text-gray-800 hover:border-indigo-400'
                }`}
              >
                {config.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Rules */}
      <details className="group bg-fuchsia-50/80 border-2 border-fuchsia-200 rounded-xl p-3.5 mb-5 cursor-pointer focus:outline-none transition-all hover:bg-fuchsia-100/70">
        <summary className="list-none [&::-webkit-details-marker]:hidden flex items-center justify-between text-sm font-bold text-fuchsia-950 select-none">
          <div className="flex items-center space-x-2">
            <HelpCircle className="h-4 w-4 text-fuchsia-600" />
            <span>💡 Подсказка и правила спряжения</span>
            <span className="text-xs bg-fuchsia-200 text-fuchsia-800 px-2 py-0.5 rounded-full font-semibold">
              {DRILL_TYPES[drillType]?.label || 'Rules'}
            </span>
          </div>
          <span className="text-xs font-bold text-fuchsia-700 group-open:hidden">Показать правила ▾</span>
          <span className="text-xs font-bold text-fuchsia-700 hidden group-open:block">Скрыть правила ▴</span>
        </summary>
        <div className="space-y-2 mt-3 pt-2 border-t border-fuchsia-200/80 pl-1 cursor-default" onClick={(event) => event.stopPropagation()}>
          {rules.map((rule, idx) => (
            <p key={idx} className="text-sm text-gray-800 leading-relaxed font-medium">
              {rule}
            </p>
          ))}
        </div>
      </details>

      {!sessionActive && !currentQuestion && (
        <button
          type="button"
          onClick={startSession}
          className="w-full px-6 py-4 bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white rounded-xl hover:from-fuchsia-600 hover:to-indigo-600 transition-all shadow-md hover:shadow-lg font-bold text-lg flex items-center justify-center space-x-3"
        >
          <Play className="h-6 w-6" />
          <span>Начать тренировку спряжений</span>
        </button>
      )}

      {currentQuestion && (
        <div className="bg-gradient-to-r from-pink-50 to-indigo-50 border-2 border-indigo-200 rounded-2xl p-5 sm:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-5">
            <div>
              <p className="text-xs sm:text-sm font-semibold text-gray-600">
                {currentQuestion.instruction || 'Напишите правильную форму'}
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">
                {currentQuestion.prompt || `${currentQuestion.pronoun} + ${currentQuestion.verb}`}
              </p>
              <p className="text-sm text-gray-600 mt-1">{currentQuestion.translation}</p>
            </div>
            <div className="flex flex-wrap gap-1.5 self-start md:self-center">
              <span className="px-3 py-1.5 bg-white border border-indigo-200 rounded-full text-xs font-bold text-indigo-800">
                {DRILL_TYPES[drillType].label}
              </span>
              <span className="px-3 py-1.5 bg-purple-100 border border-purple-200 rounded-full text-xs font-bold text-purple-800">
                {DRILL_PRONOUN_MODES[pronounMode]?.label || 'Все'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
            <input
              type="text"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  showResult ? nextQuestion() : checkDrillAnswer();
                }
              }}
              disabled={showResult}
              placeholder="Введите испанскую форму..."
              className={`w-full px-4 py-3 sm:px-5 sm:py-4 rounded-xl border-2 text-base sm:text-lg font-semibold ${
                showResult
                  ? isCorrect
                    ? 'bg-green-100 border-green-500 text-green-950'
                    : 'bg-orange-100 border-orange-500 text-orange-950'
                  : 'border-pink-300 focus:border-fuchsia-500 focus:outline-none bg-white'
              }`}
            />

            {!showResult ? (
              <button
                type="button"
                onClick={checkDrillAnswer}
                disabled={!answer.trim()}
                className="w-full px-4 py-3 sm:py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 disabled:opacity-50 font-bold transition-all shadow-md"
              >
                Проверить
              </button>
            ) : (
              <button
                type="button"
                onClick={nextQuestion}
                className="w-full px-4 py-3 sm:py-4 bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white rounded-xl hover:from-fuchsia-600 hover:to-indigo-600 font-bold transition-all shadow-md flex items-center justify-center space-x-2"
              >
                <RefreshCw className="h-5 w-5" />
                <span>{finished ? 'Завершить' : 'Далее'}</span>
              </button>
            )}
          </div>

          {showResult && (
            <div className="mt-4 p-4 rounded-xl border bg-white space-y-1">
              <div className="flex items-center space-x-2">
                {isCorrect ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <p className="font-bold text-green-900">Правильно!</p>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-orange-600" />
                    <p className="font-bold text-orange-950">Неточно</p>
                  </>
                )}
              </div>
              <p className="text-sm text-gray-700">
                Правильный ответ: <span className="font-bold text-gray-900">{getVerbDrillDisplayAnswer(currentQuestion)}</span>
              </p>
              {currentQuestion.reason && (
                <p className="text-xs text-gray-500">Почему: {currentQuestion.reason}</p>
              )}
            </div>
          )}
        </div>
      )}

      {finished && (
        <div className="mt-4 bg-purple-50 border border-purple-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <p className="font-bold text-purple-950">Сессия из 10 заданий завершена!</p>
            <p className="text-sm text-purple-800">
              Результат: {stats.correct} / 10 ({accuracy}% точность)
            </p>
          </div>
          <button
            type="button"
            onClick={() => resetSession(drillType, runMode, pronounMode)}
            className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-all flex items-center space-x-2"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Повторить</span>
          </button>
        </div>
      )}
    </section>
  );
}

// ----------------------------------------------------
// 2. AI GRAMMAR & VOCABULARY EXERCISES (GEMINI 3.7 FLASH)
// ----------------------------------------------------
function GrammarExercisesSection({ topics, maxLevel, onTopicUpdated }) {
  const [loading, setLoading] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [sessionMode, setSessionMode] = useState('ten');
  
  const [exerciseQueue, setExerciseQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRoundFinished, setIsRoundFinished] = useState(false);

  const [userAnswer, setUserAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  
  const [roundStats, setRoundStats] = useState({ total: 0, correct: 0, streak: 0 });
  const [overallStats, setOverallStats] = useState({ total: 0, correct: 0, streak: 0 });
  const [scoreFeedback, setScoreFeedback] = useState('');

  const prefetchingRef = useRef(false);
  const [activeTheoryModal, setActiveTheoryModal] = useState({ isOpen: false, topicId: null, topicName: '' });

  const SPANISH_SPECIAL_CHARS = ['á', 'é', 'í', 'ó', 'ú', 'ñ', '¿', '¡', 'Á', 'É', 'Í', 'Ó', 'Ú', 'Ñ'];

  const insertChar = (char) => {
    setUserAnswer(prev => prev + char);
  };

  const fetchExerciseBatch = async () => {
    const response = await profileFetch(profileApiUrl('/spanish/api/exercises/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topicId: selectedTopic !== 'all' ? selectedTopic : undefined,
        type: selectedType !== 'all' ? selectedType : undefined
      })
    });
    const data = await response.json();
    return data.exercises || (data.exercise ? [data.exercise] : []);
  };

  const startNewBatch = async () => {
    setLoading(true);
    setShowResult(false);
    setUserAnswer('');
    setSelectedOption('');
    setIsRoundFinished(false);
    setScoreFeedback('');
    setRoundStats({ total: 0, correct: 0, streak: overallStats.streak });
    setCurrentIndex(0);

    try {
      const newExercises = await fetchExerciseBatch();
      if (newExercises.length > 0) {
        setExerciseQueue(newExercises);
      }
    } catch (error) {
      console.error('Error generating exercise batch:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkAnswer = async () => {
    const currentExercise = exerciseQueue[currentIndex];
    if (!currentExercise || showResult) return;

    let answerToCheck = '';
    if (currentExercise.type === 'multiple-choice') {
      answerToCheck = selectedOption;
    } else {
      answerToCheck = userAnswer.trim();
    }

    if (!answerToCheck) return;

    const correct = checkGrammarAnswerMatch(
      answerToCheck, 
      currentExercise.correctAnswer, 
      currentExercise.alternativeAnswers
    );

    setIsCorrect(correct);
    setShowResult(true);

    const newStreak = correct ? overallStats.streak + 1 : 0;
    setRoundStats(prev => ({
      total: prev.total + 1,
      correct: prev.correct + (correct ? 1 : 0),
      streak: newStreak
    }));

    setOverallStats(prev => ({
      total: prev.total + 1,
      correct: prev.correct + (correct ? 1 : 0),
      streak: newStreak
    }));

    const { rawTopicName, topicLevel } = parseExerciseTag(currentExercise.topic);
    const targetTopicId = currentExercise.topicId || (selectedTopic !== 'all' ? selectedTopic : undefined);

    try {
      await profileFetch(profileApiUrl('/spanish/api/topics/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: targetTopicId,
          topic: rawTopicName,
          category: 'Practice',
          level: topicLevel || currentExercise.level,
          success: correct
        })
      });
      if (typeof onTopicUpdated === 'function') {
        onTopicUpdated();
      }
    } catch (error) {
      console.error('Error updating topic progress:', error);
    }

    if (sessionMode === 'endless' && currentIndex >= exerciseQueue.length - 3 && !prefetchingRef.current) {
      prefetchingRef.current = true;
      fetchExerciseBatch().then(extra => {
        if (extra && extra.length > 0) {
          setExerciseQueue(prev => [...prev, ...extra]);
        }
      }).catch(err => console.warn('Prefetch error:', err)).finally(() => {
        prefetchingRef.current = false;
      });
    }
  };

  const handleSetTopicScore = async (score) => {
    let targetId = selectedTopic !== 'all' ? selectedTopic : null;
    if (!targetId && exerciseQueue.length > 0) {
      targetId = exerciseQueue[0].topicId;
      if (!targetId) {
        const rawTag = parseExerciseTag(exerciseQueue[0].topic).rawTopicName;
        const match = topics.find(t => t.name.toLowerCase() === rawTag.toLowerCase());
        if (match) targetId = match.id;
      }
    }
    if (!targetId) return;

    try {
      await profileFetch(profileApiUrl(`/spanish/api/topics/${targetId}/set-score`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score })
      });
      setScoreFeedback(score === 100 ? 'Тема успешно отмечена как 100% ✅' : 'Тема успешно сброшена на 0% ⭕');
      if (typeof onTopicUpdated === 'function') {
        onTopicUpdated();
      }
    } catch (err) {
      console.error('Error updating score:', err);
    }
  };

  const nextExercise = () => {
    setUserAnswer('');
    setSelectedOption('');
    setShowResult(false);
    setIsCorrect(false);

    if (sessionMode === 'ten' && currentIndex >= 9) {
      setIsRoundFinished(true);
      return;
    }

    if (currentIndex + 1 < exerciseQueue.length) {
      setCurrentIndex(prev => prev + 1);
    } else {
      startNewBatch();
    }
  };

  const currentExercise = exerciseQueue[currentIndex];
  const roundAccuracy = roundStats.total === 0 ? 0 : Math.round((roundStats.correct / roundStats.total) * 100);
  const currentStep = sessionMode === 'ten' ? Math.min(10, currentIndex + 1) : currentIndex + 1;
  const progressPercent = sessionMode === 'ten' ? (currentStep / 10) * 100 : 100;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 flex items-center">
              <Brain className="h-8 w-8 mr-3 text-purple-600" />
              AI Grammar & Vocabulary Exercises
            </h2>
            <p className="text-gray-600 mt-2 text-sm sm:text-base">
              Practice 10-task nuanced sets based on your curriculum (up to {maxLevel})
            </p>
          </div>
          
          <div className="grid grid-cols-3 gap-3 md:flex md:space-x-4">
            <div className="bg-purple-100 rounded-xl p-3 md:p-4 text-center">
              <p className="text-xs md:text-sm text-purple-600 font-semibold">Completed</p>
              <p className="text-xl md:text-2xl font-bold text-purple-900">{overallStats.total}</p>
            </div>
            <div className="bg-green-100 rounded-xl p-3 md:p-4 text-center">
              <p className="text-xs md:text-sm text-green-600 font-semibold">Correct</p>
              <p className="text-xl md:text-2xl font-bold text-green-900">{overallStats.correct}</p>
            </div>
            <div className="bg-orange-100 rounded-xl p-3 md:p-4 text-center">
              <p className="text-xs md:text-sm text-orange-600 font-semibold">Streak</p>
              <p className="text-xl md:text-2xl font-bold text-orange-900">🔥 {overallStats.streak}</p>
            </div>
          </div>
        </div>

        {/* Filters with visible percentage */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-gray-700">Topic</label>
              {selectedTopic !== 'all' && (
                <button
                  type="button"
                  onClick={() => {
                    const tObj = topics.find(t => String(t.id) === String(selectedTopic));
                    setActiveTheoryModal({ isOpen: true, topicId: selectedTopic, topicName: tObj?.name || 'Topic' });
                  }}
                  className="text-xs font-bold text-fuchsia-600 hover:text-fuchsia-700 flex items-center space-x-1"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>Правило и AI-репетитор</span>
                </button>
              )}
            </div>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="w-full px-4 py-3 border-2 border-purple-300 rounded-xl focus:border-purple-500 focus:outline-none font-medium text-sm"
            >
              <option value="all">🎲 Random Topic</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {Boolean(topic.is_locked) ? '🔒 ' : ''}{topic.name} ({topic.level}) — {Math.round(topic.score || 0)}%
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Type</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-4 py-3 border-2 border-purple-300 rounded-xl focus:border-purple-500 focus:outline-none font-medium text-sm"
            >
              <option value="all">🎲 All Types (Mix)</option>
              <option value="multiple-choice">📝 Multiple Choice</option>
              <option value="fill-blank">✍️ Fill in the Blank</option>
              <option value="open">💭 Open Answer</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Режим сессии</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSessionMode('ten')}
                className={`px-3 py-3 rounded-xl border-2 font-bold transition-all text-xs flex items-center justify-center gap-1.5 ${
                  sessionMode === 'ten'
                    ? 'bg-purple-600 border-purple-700 text-white shadow-md'
                    : 'bg-white border-purple-200 text-gray-700 hover:border-purple-400'
                }`}
              >
                <Layers className="h-4 w-4" />
                <span>10 заданий</span>
              </button>

              <button
                type="button"
                onClick={() => setSessionMode('endless')}
                className={`px-3 py-3 rounded-xl border-2 font-bold transition-all text-xs flex items-center justify-center gap-1.5 ${
                  sessionMode === 'endless'
                    ? 'bg-indigo-600 border-indigo-700 text-white shadow-md'
                    : 'bg-white border-indigo-200 text-gray-700 hover:border-indigo-400'
                }`}
              >
                <InfinityIcon className="h-4 w-4" />
                <span>Бесконечный</span>
              </button>
            </div>
          </div>
        </div>

        {(!currentExercise || isRoundFinished) && (
          <button
            onClick={startNewBatch}
            disabled={loading}
            className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 font-bold text-lg flex items-center justify-center space-x-3 transition-all shadow-md hover:shadow-lg"
          >
            {loading ? (
              <>
                <RefreshCw className="h-6 w-6 animate-spin" />
                <span>Генерация пачки из 10 заданий с Gemini 3.7 Flash...</span>
              </>
            ) : (
              <>
                <Brain className="h-6 w-6" />
                <span>{isRoundFinished ? '🔄 Начать новый раунд (10 заданий)' : '🚀 Начать тренировку (Пачка из 10)'}</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Round Finished Screen */}
      {isRoundFinished && (
        <div className="bg-gradient-to-r from-purple-100 to-pink-100 border-4 border-purple-400 rounded-2xl p-6 md:p-10 shadow-2xl text-center space-y-6 animate-fade-in">
          <div className="inline-flex p-4 bg-purple-600 text-white rounded-full shadow-lg">
            <Award className="h-12 w-12" />
          </div>
          <div>
            <h3 className="text-3xl font-black text-gray-900">Раунд из 10 заданий завершён! 🎉</h3>
            <p className="text-gray-700 mt-2 text-lg">Вы успешно отработали различные нюансы выбранного правила.</p>
          </div>

          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-200">
              <p className="text-xs text-gray-500 font-bold uppercase">Правильно</p>
              <p className="text-2xl font-black text-green-600">{roundStats.correct} / 10</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-200">
              <p className="text-xs text-gray-500 font-bold uppercase">Точность</p>
              <p className="text-2xl font-black text-purple-700">{roundAccuracy}%</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-200">
              <p className="text-xs text-gray-500 font-bold uppercase">Серия</p>
              <p className="text-2xl font-black text-orange-600">🔥 {overallStats.streak}</p>
            </div>
          </div>

          {/* Manual Topic Score Controls on Round Summary */}
          <div className="pt-2 space-y-3">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Оценить тему:</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => handleSetTopicScore(100)}
                className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-sm transition-all shadow-md hover:shadow-lg flex items-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                <span>Отметить тему как 100%</span>
              </button>

              <button
                type="button"
                onClick={() => handleSetTopicScore(0)}
                className="px-4 py-2.5 bg-white border-2 border-gray-300 hover:border-gray-400 text-gray-700 font-bold rounded-xl text-sm transition-all shadow-sm flex items-center gap-2"
              >
                <span>⭕ Отметить тему как 0%</span>
              </button>
            </div>

            {scoreFeedback && (
              <p className="text-sm font-bold text-purple-900 bg-white/90 py-1.5 px-4 rounded-lg inline-block border border-purple-300 shadow-sm animate-fade-in">
                {scoreFeedback}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-2">
            <button
              onClick={startNewBatch}
              disabled={loading}
              className="px-6 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
              <span>Ещё 10 заданий по этой теме</span>
            </button>
            <button
              onClick={() => { setSelectedTopic('all'); startNewBatch(); }}
              disabled={loading}
              className="px-6 py-3.5 bg-white border-2 border-purple-300 text-purple-900 font-bold rounded-xl shadow-sm hover:bg-purple-50 transition-all flex items-center justify-center space-x-2"
            >
              <span>🎲 Другая случайная тема</span>
            </button>
          </div>
        </div>
      )}

      {/* Active Exercise Card */}
      {currentExercise && !isRoundFinished && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 md:border-4 border-purple-300 rounded-2xl p-5 md:p-8 shadow-2xl space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm font-bold text-purple-950">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-purple-600 text-white rounded-lg text-xs">
                  {sessionMode === 'ten' ? `Вопрос ${currentStep} из 10` : `Задание #${currentStep}`}
                </span>
                {sessionMode === 'endless' && (
                  <span className="text-xs text-indigo-700 font-semibold flex items-center gap-1">
                    <InfinityIcon className="h-3.5 w-3.5" /> Бесконечный режим
                  </span>
                )}
              </div>
              <span className="text-xs font-semibold text-purple-700">
                Раунд: {roundStats.correct} правильных
              </span>
            </div>

            {sessionMode === 'ten' && (
              <div className="w-full bg-purple-200 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-600 to-pink-500 transition-all duration-500 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 bg-purple-300 text-purple-900 rounded-full text-xs font-bold">
              {currentExercise.type === 'multiple-choice' ? '📝 Quiz' : 
               currentExercise.type === 'fill-blank' ? '✍️ Fill-in' : '💭 Open'}
            </span>
            <span className="px-3 py-1 bg-pink-300 text-pink-900 rounded-full text-xs font-bold">
              {currentExercise.level}
            </span>
            <span className="px-3 py-1 bg-indigo-300 text-indigo-900 rounded-full text-xs font-bold">
              {currentExercise.topic}
            </span>
            {currentExercise.sourceLabel && (
              <span className="px-3 py-1 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-full text-xs font-bold">
                📚 {currentExercise.sourceLabel}
              </span>
            )}
            {currentExercise.targetWord && (
              <span className="px-3 py-1 bg-amber-100 border border-amber-300 text-amber-900 rounded-full text-xs font-bold">
                🎯 Слово: {currentExercise.targetWord}
              </span>
            )}
          </div>
          
          <div className="bg-white rounded-xl p-4 sm:p-6 border-2 border-purple-200">
            <p className="text-xl sm:text-2xl font-bold text-gray-800 leading-relaxed">
              {currentExercise.question}
            </p>
          </div>
          
          {currentExercise.type === 'multiple-choice' && !showResult && (
            <div className="space-y-3">
              {currentExercise.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedOption(option)}
                  className={`w-full text-left px-4 py-3 sm:px-6 sm:py-4 rounded-xl transition-all text-base sm:text-lg font-medium border-2 sm:border-3 ${
                    selectedOption === option
                      ? 'bg-purple-300 border-purple-600 text-purple-900 scale-[1.02] shadow-md'
                      : 'bg-white border-purple-300 hover:border-purple-500 text-gray-800 hover:scale-[1.01]'
                  }`}
                >
                  <span className="font-bold mr-2 sm:mr-3 text-lg sm:text-xl">{String.fromCharCode(65 + idx)}.</span>
                  {option}
                </button>
              ))}
            </div>
          )}
          
          {currentExercise.type === 'multiple-choice' && showResult && (
            <div className="space-y-3">
              {currentExercise.options.map((option, idx) => (
                <div
                  key={idx}
                  className={`w-full text-left px-4 py-3 sm:px-6 sm:py-4 rounded-xl text-base sm:text-lg font-medium border-2 sm:border-3 ${
                    option.toLowerCase() === currentExercise.correctAnswer.toLowerCase()
                      ? 'bg-green-200 border-green-600 text-green-900'
                      : option === selectedOption
                      ? 'bg-red-200 border-red-600 text-red-900'
                      : 'bg-gray-100 border-gray-300 text-gray-600'
                  }`}
                >
                  <span className="font-bold mr-2 sm:mr-3 text-lg sm:text-xl">{String.fromCharCode(65 + idx)}.</span>
                  {option}
                  {option.toLowerCase() === currentExercise.correctAnswer.toLowerCase() && (
                    <CheckCircle className="inline ml-2 h-5 w-5 text-green-700 align-middle" />
                  )}
                  {option === selectedOption && option.toLowerCase() !== currentExercise.correctAnswer.toLowerCase() && (
                    <XCircle className="inline ml-2 h-5 w-5 text-red-700 align-middle" />
                  )}
                </div>
              ))}
            </div>
          )}
          
          {(currentExercise.type === 'fill-blank' || currentExercise.type === 'open') && (
            <div>
              <input
                type="text"
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !showResult && checkAnswer()}
                disabled={showResult}
                placeholder="Type your answer here..."
                className={`w-full px-4 py-3 sm:px-6 sm:py-4 rounded-xl border-2 sm:border-3 text-base sm:text-lg font-medium ${
                  showResult
                    ? isCorrect
                      ? 'bg-green-100 border-green-600 text-green-900'
                      : 'bg-red-100 border-red-600 text-red-900'
                    : 'border-purple-400 focus:border-purple-600 focus:outline-none bg-white'
                }`}
              />

              {!showResult && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-xs text-gray-500 font-medium mr-1">Быстрый ввод:</span>
                  {SPANISH_SPECIAL_CHARS.map((char) => (
                    <button
                      key={char}
                      type="button"
                      onClick={() => insertChar(char)}
                      className="px-2 py-1 bg-white border border-gray-300 rounded text-sm font-bold text-gray-800 hover:bg-purple-100 hover:border-purple-400 transition-colors"
                    >
                      {char}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {!showResult ? (
            <button
              onClick={checkAnswer}
              disabled={
                (currentExercise.type === 'multiple-choice' && !selectedOption) ||
                ((currentExercise.type === 'fill-blank' || currentExercise.type === 'open') && !userAnswer.trim())
              }
              className="w-full px-6 py-3.5 sm:px-8 sm:py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 disabled:opacity-50 font-bold text-lg sm:text-xl transition-all shadow-md hover:shadow-lg"
            >
              ✓ Check Answer
            </button>
          ) : (
            <div className="space-y-4">
              <div className={`p-4 sm:p-6 rounded-xl border-2 sm:border-3 ${
                isCorrect
                  ? 'bg-green-100 border-green-500 text-green-900'
                  : 'bg-orange-100 border-orange-500 text-orange-900'
              }`}>
                <div className="flex items-center space-x-3">
                  {isCorrect ? (
                    <>
                      <CheckCircle className="h-8 w-8 sm:h-10 sm:w-10 text-green-600" />
                      <div>
                        <p className="text-xl sm:text-2xl font-bold">Correct! 🎉</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-8 w-8 sm:h-10 sm:w-10 text-orange-600" />
                      <div>
                        <p className="text-xl sm:text-2xl font-bold">Not quite right</p>
                        <p className="text-sm sm:text-lg">
                          The correct answer is: <span className="font-bold underline">{currentExercise.correctAnswer}</span>
                        </p>
                      </div>
                    </>
                  )}
                </div>

                <div className="bg-white/80 p-3 rounded-lg border border-purple-200 mt-2 space-y-1">
                  {Array.isArray(currentExercise.alternativeAnswers) && currentExercise.alternativeAnswers.length > 0 && (
                    <p className="text-xs text-gray-700 font-semibold">
                      Также допустимо: <span className="font-bold text-purple-950">{currentExercise.alternativeAnswers.join(' / ')}</span>
                    </p>
                  )}
                  {currentExercise.explanation && (
                    <p className="text-sm sm:text-base font-medium text-gray-800">{currentExercise.explanation}</p>
                  )}
                </div>
              </div>
              
              <button
                onClick={nextExercise}
                className="w-full px-6 py-3.5 sm:px-8 sm:py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all shadow-md hover:shadow-lg font-bold text-lg sm:text-xl flex items-center justify-center space-x-2"
              >
                <RefreshCw className="h-5 w-5 sm:h-6 sm:w-6" />
                <span>{sessionMode === 'ten' && currentIndex >= 9 ? '🏆 Завершить раунд (10/10)' : 'Следующий вопрос →'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 3. FULL SENTENCE TRANSLATION MODE COMPONENT (LAST TAB)
// ----------------------------------------------------
function SentenceTranslationExerciseSection({ topics, onTopicUpdated }) {
  const [selectedTopicIds, setSelectedTopicIds] = useState([]);
  const [sessionMode, setSessionMode] = useState('ten'); // 'ten' | 'endless'
  const [loading, setLoading] = useState(false);
  const [exerciseQueue, setExerciseQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRoundFinished, setIsRoundFinished] = useState(false);

  const [userTranslation, setUserTranslation] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const [roundStats, setRoundStats] = useState({ total: 0, correct: 0, streak: 0 });
  const [overallStats, setOverallStats] = useState({ total: 0, correct: 0, streak: 0 });
  const [scoreFeedback, setScoreFeedback] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState('all');

  const prefetchingRef = useRef(false);
  const [activeTheoryModal, setActiveTheoryModal] = useState({ isOpen: false, topicId: null, topicName: '' });

  const SPANISH_SPECIAL_CHARS = ['á', 'é', 'í', 'ó', 'ú', 'ñ', '¿', '¡', 'Á', 'É', 'Í', 'Ó', 'Ú', 'Ñ'];

  const insertChar = (char) => {
    setUserTranslation(prev => prev + char);
  };

  const toggleTopicSelection = (topicId) => {
    setSelectedTopicIds(prev => 
      prev.includes(topicId) 
        ? prev.filter(id => id !== topicId) 
        : [...prev, topicId]
    );
  };

  const selectRandomTopics = () => {
    if (topics.length === 0) return;
    const shuffled = [...topics].sort(() => 0.5 - Math.random());
    setSelectedTopicIds(shuffled.slice(0, 3).map(t => t.id));
  };

  const fetchTranslationBatch = async () => {
    const response = await profileFetch(profileApiUrl('/spanish/api/exercises/generate-translation'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topicIds: selectedTopicIds.length > 0 ? selectedTopicIds : undefined
      })
    });
    const data = await response.json();
    return data.exercises || [];
  };

  const startNewBatch = async () => {
    setLoading(true);
    setShowResult(false);
    setUserTranslation('');
    setIsRoundFinished(false);
    setScoreFeedback('');
    setRoundStats({ total: 0, correct: 0, streak: overallStats.streak });
    setCurrentIndex(0);

    try {
      const newExercises = await fetchTranslationBatch();
      if (newExercises.length > 0) {
        setExerciseQueue(newExercises);
      }
    } catch (error) {
      console.error('Error generating translation batch:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkAnswer = async () => {
    const current = exerciseQueue[currentIndex];
    if (!current || showResult || !userTranslation.trim()) return;

    const correct = checkGrammarAnswerMatch(userTranslation, current.targetSentence, current.alternativeAnswers);
    setIsCorrect(correct);
    setShowResult(true);

    const newStreak = correct ? overallStats.streak + 1 : 0;
    setRoundStats(prev => ({
      total: prev.total + 1,
      correct: prev.correct + (correct ? 1 : 0),
      streak: newStreak
    }));

    setOverallStats(prev => ({
      total: prev.total + 1,
      correct: prev.correct + (correct ? 1 : 0),
      streak: newStreak
    }));

    // Update progress for selected topics or detected grammar
    const targetIds = selectedTopicIds.length > 0 ? selectedTopicIds : [];
    try {
      if (targetIds.length > 0) {
        for (const tid of targetIds) {
          await profileFetch(profileApiUrl('/spanish/api/topics/update'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topicId: tid,
              success: correct
            })
          });
        }
      } else if (current.testedGrammar) {
        await profileFetch(profileApiUrl('/spanish/api/topics/update'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: current.testedGrammar,
            success: correct
          })
        });
      }
      if (typeof onTopicUpdated === 'function') {
        onTopicUpdated();
      }
    } catch (err) {
      console.error('Error updating translation topic score:', err);
    }

    if (sessionMode === 'endless' && currentIndex >= exerciseQueue.length - 3 && !prefetchingRef.current) {
      prefetchingRef.current = true;
      fetchTranslationBatch().then(extra => {
        if (extra && extra.length > 0) {
          setExerciseQueue(prev => [...prev, ...extra]);
        }
      }).catch(err => console.warn('Prefetch error:', err)).finally(() => {
        prefetchingRef.current = false;
      });
    }
  };

  const handleSetTopicScore = async (score) => {
    const targetIds = selectedTopicIds.length > 0 ? selectedTopicIds : [];
    if (targetIds.length === 0) return;

    try {
      for (const id of targetIds) {
        await profileFetch(profileApiUrl(`/spanish/api/topics/${id}/set-score`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ score })
        });
      }
      setScoreFeedback(score === 100 ? 'Выбранные темы отмечены как 100% ✅' : 'Выбранные темы отмечены как 0% ⭕');
      if (typeof onTopicUpdated === 'function') {
        onTopicUpdated();
      }
    } catch (err) {
      console.error('Error updating score:', err);
    }
  };

  const nextExercise = () => {
    setUserTranslation('');
    setShowResult(false);
    setIsCorrect(false);

    if (sessionMode === 'ten' && currentIndex >= 9) {
      setIsRoundFinished(true);
      return;
    }

    if (currentIndex + 1 < exerciseQueue.length) {
      setCurrentIndex(prev => prev + 1);
    } else {
      startNewBatch();
    }
  };

  const current = exerciseQueue[currentIndex];
  const roundAccuracy = roundStats.total === 0 ? 0 : Math.round((roundStats.correct / roundStats.total) * 100);
  const currentStep = sessionMode === 'ten' ? Math.min(10, currentIndex + 1) : currentIndex + 1;
  const progressPercent = sessionMode === 'ten' ? (currentStep / 10) * 100 : 100;

  const filteredTopics = topics.filter(t => {
    const matchesSearch = !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLevel = filterLevel === 'all' || t.level === filterLevel;
    return matchesSearch && matchesLevel;
  });

  return (
    <div className="space-y-6">
      {/* Translation Config Header */}
      <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 flex items-center">
              <Globe className="h-8 w-8 mr-3 text-emerald-600" />
              Full Sentence Translation Mode
            </h2>
            <p className="text-gray-600 mt-2 text-sm sm:text-base">
              Translate whole meaningful sentences composed from your <span className="font-semibold text-emerald-700">mastered vocabulary</span> across chosen grammar topics.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 md:flex md:space-x-4">
            <div className="bg-emerald-100 rounded-xl p-3 md:p-4 text-center">
              <p className="text-xs md:text-sm text-emerald-700 font-semibold">Completed</p>
              <p className="text-xl md:text-2xl font-bold text-emerald-950">{overallStats.total}</p>
            </div>
            <div className="bg-green-100 rounded-xl p-3 md:p-4 text-center">
              <p className="text-xs md:text-sm text-green-700 font-semibold">Correct</p>
              <p className="text-xl md:text-2xl font-bold text-green-950">{overallStats.correct}</p>
            </div>
            <div className="bg-orange-100 rounded-xl p-3 md:p-4 text-center">
              <p className="text-xs md:text-sm text-orange-700 font-semibold">Streak</p>
              <p className="text-xl md:text-2xl font-bold text-orange-950">🔥 {overallStats.streak}</p>
            </div>
          </div>
        </div>

        {/* Topic Multi-Selection & Controls */}
        <div className="space-y-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="block text-sm font-semibold text-gray-700">
              Grammar Topics for Practice ({selectedTopicIds.length > 0 ? `${selectedTopicIds.length} selected` : 'Random / All'}):
            </label>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={selectRandomTopics}
                className="px-2.5 py-1 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-lg hover:bg-emerald-200 transition-colors"
              >
                🎲 Random 3 Topics
              </button>
              {selectedTopicIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedTopicIds([])}
                  className="px-2.5 py-1 text-xs font-semibold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>

          {/* Search and Level Filters for Topics */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Поиск по темам..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex items-center gap-1 overflow-x-auto">
              {['all', 'A1', 'A2', 'B1', 'B2'].map(lvl => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setFilterLevel(lvl)}
                  className={`px-2 py-1 rounded text-xs font-bold transition-all ${
                    filterLevel === lvl
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {lvl.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Topics Chips Container with percentage visible directly on each topic */}
          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-3 bg-gray-50 border-2 border-gray-200 rounded-xl">
            {filteredTopics.map((topic) => {
              const isSelected = selectedTopicIds.includes(topic.id);
              const score = Math.round(topic.score || 0);
              const isLocked = Boolean(topic.is_locked);
              return (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => toggleTopicSelection(topic.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400'
                      : 'bg-white border border-gray-300 text-gray-800 hover:border-emerald-400 hover:bg-emerald-50/50'
                  }`}
                >
                  {isSelected && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
                  <span className="flex items-center gap-1">
                    {isLocked ? <span>🔒</span> : null}
                    <span>{topic.name}</span>
                    <span className="text-[10px] opacity-75">({topic.level})</span>
                  </span>

                  {/* Direct Visible Percentage Badge */}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                    isSelected
                      ? 'bg-emerald-800 text-emerald-100'
                      : score >= 80 
                      ? 'bg-green-100 text-green-800' 
                      : score > 0 
                      ? 'bg-yellow-100 text-yellow-800' 
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {score}%
                  </span>
                </button>
              );
            })}
          </div>

          {/* Session Mode Selector */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-semibold text-gray-700">Session Mode:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSessionMode('ten')}
                className={`px-3 py-1.5 rounded-xl border-2 font-bold transition-all text-xs flex items-center gap-1.5 ${
                  sessionMode === 'ten'
                    ? 'bg-emerald-600 border-emerald-700 text-white shadow-sm'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-emerald-400'
                }`}
              >
                <Layers className="h-4 w-4" />
                <span>10 Tasks</span>
              </button>

              <button
                type="button"
                onClick={() => setSessionMode('endless')}
                className={`px-3 py-1.5 rounded-xl border-2 font-bold transition-all text-xs flex items-center gap-1.5 ${
                  sessionMode === 'endless'
                    ? 'bg-indigo-600 border-indigo-700 text-white shadow-sm'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-indigo-400'
                }`}
              >
                <InfinityIcon className="h-4 w-4" />
                <span>Endless</span>
              </button>
            </div>
          </div>
        </div>

        {/* Generate / Start Button */}
        {(!current || isRoundFinished) && (
          <button
            onClick={startNewBatch}
            disabled={loading}
            className="w-full px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 font-bold text-lg flex items-center justify-center space-x-3 transition-all shadow-md hover:shadow-lg"
          >
            {loading ? (
              <>
                <RefreshCw className="h-6 w-6 animate-spin" />
                <span>Генерация 10 предложений из выученных слов...</span>
              </>
            ) : (
              <>
                <Globe className="h-6 w-6" />
                <span>{isRoundFinished ? '🔄 Начать новый раунд перевода (10 фраз)' : '🚀 Начать перевод предложений (Пачка из 10)'}</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Round Finished Screen */}
      {isRoundFinished && (
        <div className="bg-gradient-to-r from-emerald-100 to-teal-100 border-4 border-emerald-400 rounded-2xl p-6 md:p-10 shadow-2xl text-center space-y-6 animate-fade-in">
          <div className="inline-flex p-4 bg-emerald-600 text-white rounded-full shadow-lg">
            <Award className="h-12 w-12" />
          </div>
          <div>
            <h3 className="text-3xl font-black text-gray-900">Раунд перевода из 10 предложений завершён! 🎉</h3>
            <p className="text-gray-700 mt-2 text-lg">Вы успешно перевели полные фразы с вашими выученными словами и грамматикой.</p>
          </div>

          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-emerald-200">
              <p className="text-xs text-gray-500 font-bold uppercase">Правильно</p>
              <p className="text-2xl font-black text-emerald-600">{roundStats.correct} / 10</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-emerald-200">
              <p className="text-xs text-gray-500 font-bold uppercase">Точность</p>
              <p className="text-2xl font-black text-teal-700">{roundAccuracy}%</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-emerald-200">
              <p className="text-xs text-gray-500 font-bold uppercase">Серия</p>
              <p className="text-2xl font-black text-orange-600">🔥 {overallStats.streak}</p>
            </div>
          </div>

          {/* Manual Topic Score Controls on Translation Round Summary */}
          {selectedTopicIds.length > 0 && (
            <div className="pt-2 space-y-3">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Оценить выбранные темы:</p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => handleSetTopicScore(100)}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>Отметить темы как 100%</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSetTopicScore(0)}
                  className="px-4 py-2.5 bg-white border-2 border-gray-300 hover:border-gray-400 text-gray-700 font-bold rounded-xl text-sm transition-all shadow-sm flex items-center gap-2"
                >
                  <span>⭕ Отметить темы как 0%</span>
                </button>
              </div>

              {scoreFeedback && (
                <p className="text-sm font-bold text-emerald-900 bg-white/90 py-1.5 px-4 rounded-lg inline-block border border-emerald-300 shadow-sm animate-fade-in">
                  {scoreFeedback}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-2">
            <button
              onClick={startNewBatch}
              disabled={loading}
              className="px-6 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
              <span>Ещё 10 предложений</span>
            </button>
            <button
              onClick={() => { selectRandomTopics(); startNewBatch(); }}
              disabled={loading}
              className="px-6 py-3.5 bg-white border-2 border-emerald-300 text-emerald-900 font-bold rounded-xl shadow-sm hover:bg-emerald-50 transition-all flex items-center justify-center space-x-2"
            >
              <span>🎲 Сменить темы и продолжить</span>
            </button>
          </div>
        </div>
      )}

      {/* Active Translation Exercise Card */}
      {current && !isRoundFinished && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-2 md:border-4 border-emerald-300 rounded-2xl p-5 md:p-8 shadow-2xl space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm font-bold text-emerald-950">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs">
                  {sessionMode === 'ten' ? `Предложение ${currentStep} из 10` : `Предложение #${currentStep}`}
                </span>
                {sessionMode === 'endless' && (
                  <span className="text-xs text-teal-700 font-semibold flex items-center gap-1">
                    <InfinityIcon className="h-3.5 w-3.5" /> Бесконечный режим
                  </span>
                )}
              </div>
              <span className="text-xs font-semibold text-emerald-700">
                Раунд: {roundStats.correct} правильных
              </span>
            </div>

            {sessionMode === 'ten' && (
              <div className="w-full bg-emerald-200 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-600 to-teal-500 transition-all duration-500 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 bg-emerald-200 text-emerald-950 rounded-full text-xs font-bold flex items-center gap-1">
              <Globe className="h-3 w-3" /> Перевод на испанский
            </span>
            {current.testedGrammar && (
              <span className="px-3 py-1 bg-teal-200 text-teal-950 rounded-full text-xs font-bold">
                📝 {current.testedGrammar}
              </span>
            )}
            {current.sourceLabel && (
              <span className="px-3 py-1 bg-green-100 border border-green-300 text-green-900 rounded-full text-xs font-bold">
                📚 {current.sourceLabel}
              </span>
            )}
            {Array.isArray(current.usedVocabulary) && current.usedVocabulary.length > 0 && (
              <span className="px-3 py-1 bg-amber-100 border border-amber-300 text-amber-900 rounded-full text-xs font-bold">
                🎯 Слова: {current.usedVocabulary.join(', ')}
              </span>
            )}
          </div>

          <div className="bg-white rounded-xl p-5 md:p-6 border-2 border-emerald-200 shadow-sm">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Переведите предложение на испанский:</p>
            <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-snug">
              {current.sourceSentence}
            </p>
          </div>

          <div>
            <textarea
              rows={2}
              value={userTranslation}
              onChange={(e) => setUserTranslation(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  showResult ? nextExercise() : checkAnswer();
                }
              }}
              disabled={showResult}
              placeholder="Введите полный перевод предложения..."
              className={`w-full px-4 py-3 sm:px-5 sm:py-4 rounded-xl border-2 sm:border-3 text-lg font-medium resize-none ${
                showResult
                  ? isCorrect
                    ? 'bg-green-100 border-green-600 text-green-950'
                    : 'bg-red-100 border-red-600 text-red-950'
                  : 'border-emerald-400 focus:border-emerald-600 focus:outline-none bg-white'
              }`}
            />

            {!showResult && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-xs text-gray-500 font-medium mr-1">Быстрый ввод:</span>
                {SPANISH_SPECIAL_CHARS.map((char) => (
                  <button
                    key={char}
                    type="button"
                    onClick={() => insertChar(char)}
                    className="px-2 py-1 bg-white border border-gray-300 rounded text-sm font-bold text-gray-800 hover:bg-emerald-100 hover:border-emerald-400 transition-colors"
                  >
                    {char}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!showResult ? (
            <button
              onClick={checkAnswer}
              disabled={!userTranslation.trim()}
              className="w-full px-6 py-4 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl hover:from-emerald-700 hover:to-green-700 disabled:opacity-50 font-bold text-xl transition-all shadow-md hover:shadow-lg"
            >
              ✓ Проверить перевод
            </button>
          ) : (
            <div className="space-y-4 animate-fade-in">
              <div className={`p-5 rounded-xl border-2 sm:border-3 space-y-3 ${
                isCorrect
                  ? 'bg-green-100 border-green-500 text-green-950'
                  : 'bg-orange-100 border-orange-500 text-orange-900'
              }`}>
                <div className="flex items-center space-x-3">
                  {isCorrect ? (
                    <>
                      <CheckCircle className="h-8 w-8 text-green-600 flex-shrink-0" />
                      <div>
                        <p className="text-xl sm:text-2xl font-bold">Отлично! Перевод правильный 🎉</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-8 w-8 text-orange-600 flex-shrink-0" />
                      <div>
                        <p className="text-xl sm:text-2xl font-bold">Есть неточность в переводе</p>
                      </div>
                    </>
                  )}
                </div>

                <div className="bg-white/80 p-4 rounded-xl space-y-2 border border-emerald-200/80 text-gray-900">
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase">Эталонный перевод:</p>
                    <p className="text-lg font-extrabold text-emerald-950">{current.targetSentence}</p>
                  </div>

                  {Array.isArray(current.alternativeAnswers) && current.alternativeAnswers.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase">Также допустимо:</p>
                      <p className="text-sm font-semibold text-gray-800">{current.alternativeAnswers.join(' / ')}</p>
                    </div>
                  )}

                  {current.explanation && (
                    <div className="pt-2 border-t border-gray-200">
                      <p className="text-xs font-bold text-gray-500 uppercase">Грамматический разбор:</p>
                      <p className="text-sm font-medium text-gray-800 leading-relaxed mt-0.5">{current.explanation}</p>
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={nextExercise}
                className="w-full px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 font-bold text-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center space-x-2"
              >
                <RefreshCw className="h-5 w-5" />
                <span>{sessionMode === 'ten' && currentIndex >= 9 ? '🏆 Завершить раунд (10/10)' : 'Следующее предложение →'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 4. MAIN EXERCISES CONTAINER COMPONENT
// Order of tabs: 1. Verb Drills, 2. Grammar, 3. Translation
// ----------------------------------------------------
function Exercises() {
  const [activeTab, setActiveTab] = useState('verb_drills');
  const [topics, setTopics] = useState([]);
  const [maxLevel, setMaxLevel] = useState('B2');

  useEffect(() => {
    loadTopics();
  }, []);

  const loadTopics = async () => {
    try {
      const response = await profileFetch(profileApiUrl('/spanish/api/curriculum'));
      const data = await response.json();
      setTopics(data.topics || []);
      if (data.maxLevel) setMaxLevel(data.maxLevel);
    } catch (error) {
      console.error('Error loading topics:', error);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Mode Selector Tabs in requested order: 1. Verb Drills, 2. Grammar, 3. Translation */}
      <div className="bg-white p-2 rounded-2xl shadow-md flex flex-wrap sm:flex-nowrap gap-2 border-2 border-gray-100">
        <button
          onClick={() => setActiveTab('verb_drills')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all ${
            activeTab === 'verb_drills'
              ? 'bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Target className="h-5 w-5" />
          <span>🎯 Спряжение глаголов</span>
        </button>

        <button
          onClick={() => setActiveTab('grammar')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all ${
            activeTab === 'grammar'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Brain className="h-5 w-5" />
          <span>🧠 Грамматические тесты</span>
        </button>

        <button
          onClick={() => setActiveTab('translation')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all ${
            activeTab === 'translation'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Globe className="h-5 w-5" />
          <span>🌐 Перевод предложений</span>
        </button>
      </div>

      {/* 1. Verb Conjugation Drills (First Tab) */}
      {activeTab === 'verb_drills' && (
        <VerbConjugationDrills onTopicUpdated={loadTopics} />
      )}

      {/* 2. Grammar & Fill-in Exercises (Second Tab) */}
      {activeTab === 'grammar' && (
        <GrammarExercisesSection topics={topics} maxLevel={maxLevel} onTopicUpdated={loadTopics} />
      )}

      {/* 3. Sentence Translation Mode (Third / Last Tab) */}
      {activeTab === 'translation' && (
        <SentenceTranslationExerciseSection topics={topics} onTopicUpdated={loadTopics} />
      )}
    </div>
  );
}

export default Exercises;
