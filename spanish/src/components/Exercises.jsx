import React, { useState, useEffect } from 'react';
import { Brain, Target, RefreshCw, CheckCircle, XCircle, Award, TrendingUp, Play, RotateCcw } from 'lucide-react';
import { profileApiUrl, profileFetch } from '../utils/api';
import { parseExerciseTag } from '../utils/exerciseParser';
import {
  createVerbDrillQuestion,
  DRILL_RUN_MODES,
  DRILL_TYPES,
  getVerbDrillDisplayAnswer,
  getVerbDrillProgressTopic,
  isVerbDrillAnswerCorrect,
  isVerbDrillFinished,
} from '../utils/verbDrills';

function VerbConjugationDrills() {
  const [drillType, setDrillType] = useState('regular');
  const [runMode, setRunMode] = useState('ten');
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [stats, setStats] = useState({ correct: 0, incorrect: 0, completed: 0 });

  const resetSession = (nextDrillType = drillType, nextRunMode = runMode) => {
    setDrillType(nextDrillType);
    setRunMode(nextRunMode);
    setCurrentQuestion(null);
    setAnswer('');
    setShowResult(false);
    setIsCorrect(false);
    setSessionActive(false);
    setStats({ correct: 0, incorrect: 0, completed: 0 });
  };

  const startSession = () => {
    setStats({ correct: 0, incorrect: 0, completed: 0 });
    setCurrentQuestion(createVerbDrillQuestion(drillType));
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
    } catch (error) {
      console.error('Error updating verb drill topic:', error);
    }
  };

  const nextQuestion = () => {
    if (isVerbDrillFinished(runMode, stats.completed)) {
      setSessionActive(false);
      return;
    }

    setCurrentQuestion(createVerbDrillQuestion(drillType));
    setAnswer('');
    setShowResult(false);
    setIsCorrect(false);
  };

  const finished = isVerbDrillFinished(runMode, stats.completed);
  const total = stats.correct + stats.incorrect;
  const accuracy = total === 0 ? 0 : Math.round((stats.correct / total) * 100);
  const rules = DRILL_TYPES[drillType].rules;

  return (
    <section className="bg-white rounded-2xl shadow-2xl p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-800 flex items-center">
            <Target className="h-8 w-8 mr-3 text-fuchsia-600" />
            Verb Conjugation Practice
          </h2>
          <p className="text-gray-600 mt-2">
            Read the rule, then write the correct present-tense form.
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_180px] gap-4 mb-5">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Drill</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {Object.entries(DRILL_TYPES).map(([type, config]) => (
              <button
                key={type}
                type="button"
                onClick={() => resetSession(type, runMode)}
                className={`px-2 py-2 sm:px-4 sm:py-3 rounded-xl border-2 font-bold transition-all text-xs sm:text-sm ${
                  drillType === type
                    ? 'bg-fuchsia-500 border-fuchsia-600 text-white shadow-md'
                    : 'bg-white border-pink-200 text-gray-800 hover:border-fuchsia-400'
                }`}
              >
                {config.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Mode</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(DRILL_RUN_MODES).map(([mode, config]) => (
              <button
                key={mode}
                type="button"
                onClick={() => resetSession(drillType, mode)}
                className={`px-3 py-3 rounded-xl border-2 font-bold transition-all ${
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

      <details className="group bg-fuchsia-50 border border-fuchsia-200 rounded-xl p-3 mb-5 cursor-pointer focus:outline-none">
        <summary className="list-none [&::-webkit-details-marker]:hidden flex items-center justify-between text-sm font-bold text-fuchsia-900">
          <span>Conjugation Rules</span>
          <span className="text-xs text-fuchsia-500 group-open:hidden">Show rules ▾</span>
          <span className="text-xs text-fuchsia-500 hidden group-open:block">Hide rules ▴</span>
        </summary>
        <div className="space-y-1 mt-2 pl-1 cursor-default" onClick={(event) => event.stopPropagation()}>
          {rules.map((rule) => (
            <p key={rule} className="text-sm text-gray-800">{rule}</p>
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
          <span>Start Verb Drill</span>
        </button>
      )}

      {currentQuestion && (
        <div className="bg-gradient-to-r from-pink-50 to-indigo-50 border-2 border-indigo-200 rounded-2xl p-5 sm:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-5">
            <div>
              <p className="text-xs sm:text-sm font-semibold text-gray-600">
                {currentQuestion.instruction || 'Write the correct form'}
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">
                {currentQuestion.prompt || `${currentQuestion.pronoun} + ${currentQuestion.verb}`}
              </p>
              <p className="text-sm text-gray-600 mt-1">{currentQuestion.translation}</p>
            </div>
            <span className="px-4 py-2 bg-white border border-indigo-200 rounded-full text-xs sm:text-sm font-bold text-indigo-800 w-fit">
              {DRILL_TYPES[drillType].label}
            </span>
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
              placeholder="Type Spanish form..."
              className={`w-full px-4 py-3 sm:px-5 sm:py-4 rounded-xl border-2 text-base sm:text-lg font-semibold ${
                showResult
                  ? isCorrect
                    ? 'bg-green-100 border-green-500 text-green-950'
                    : 'bg-orange-100 border-orange-500 text-orange-950'
                  : 'bg-white border-indigo-300 focus:border-indigo-600 focus:outline-none text-gray-900'
              }`}
            />

            {!showResult ? (
              <button
                type="button"
                onClick={checkDrillAnswer}
                disabled={!answer.trim()}
                className="px-5 py-3 sm:px-6 sm:py-4 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold flex items-center justify-center space-x-2 text-sm sm:text-base"
              >
                <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                <span>Check</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={nextQuestion}
                className="px-5 py-3 sm:px-6 sm:py-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-bold flex items-center justify-center space-x-2 text-sm sm:text-base"
              >
                <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5" />
                <span>{finished ? 'Finish' : 'Next'}</span>
              </button>
            )}
          </div>

          {showResult && (
            <div className={`mt-4 p-4 rounded-xl border-2 ${
              isCorrect
                ? 'bg-green-100 border-green-500 text-green-950'
                : 'bg-orange-100 border-orange-500 text-orange-950'
            }`}>
              <div className="flex items-start space-x-3">
                {isCorrect ? (
                  <CheckCircle className="h-6 w-6 sm:h-7 sm:w-7 text-green-700 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-6 w-6 sm:h-7 sm:w-7 text-orange-700 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="text-lg sm:text-xl font-bold">{isCorrect ? 'Correct' : 'Not quite'}</p>
                  <p className="text-sm sm:text-base">
                    Correct answer: <span className="font-bold underline">{getVerbDrillDisplayAnswer(currentQuestion)}</span>
                  </p>
                  {currentQuestion.reason && (
                    <p className="text-xs sm:text-sm mt-1">{currentQuestion.reason}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!sessionActive && currentQuestion && finished && (
        <div className="mt-5 bg-indigo-50 border-2 border-indigo-200 rounded-xl p-5">
          <p className="text-xl font-bold text-indigo-950">10-task session complete</p>
          <p className="text-indigo-900 mt-1">
            Score: {stats.correct}/10 correct, {stats.incorrect} incorrect.
          </p>
          <button
            type="button"
            onClick={startSession}
            className="mt-4 px-5 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-bold inline-flex items-center space-x-2"
          >
            <RotateCcw className="h-5 w-5" />
            <span>Restart 10 Tasks</span>
          </button>
        </div>
      )}
    </section>
  );
}

function Exercises() {
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState('random');
  const [exerciseType, setExerciseType] = useState('multiple-choice');
  const [currentExercise, setCurrentExercise] = useState(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ correct: 0, incorrect: 0 });

  useEffect(() => {
    fetchTopics();
  }, []);

  const fetchTopics = async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return;
    }

    try {
      const response = await profileFetch(profileApiUrl('/spanish/api/topics'));
      const data = await response.json();
      setTopics(data.topics);
    } catch (error) {
      if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        console.error('Error fetching topics:', error);
      }
    }
  };

  const generateExercise = async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      alert('AI-generated exercises need internet. Verb drills work offline.');
      return;
    }

    setLoading(true);
    setShowResult(false);
    setUserAnswer('');
    setSelectedOption(null);
    
    try {
      let prompt = '';
      
      if (selectedTopic === 'random') {
        prompt = `Generate a ${exerciseType} exercise on any Spanish topic suitable for practice.`;
      } else if (selectedTopic === 'weak') {
        const weakTopics = topics
          .filter(t => t.score < 50)
          .sort((a, b) => a.score - b.score)
          .slice(0, 5)
          .map(t => t.name);
        
        if (weakTopics.length === 0) {
          prompt = `Generate a ${exerciseType} exercise on any Spanish topic.`;
        } else {
          prompt = `Generate a ${exerciseType} exercise on one of these weak topics: ${weakTopics.join(', ')}. Focus on the weakest one.`;
        }
      } else {
        const topic = topics.find(t => t.id === parseInt(selectedTopic));
        if (!topic) {
          alert('The selected topic is no longer available. Please choose another topic.');
          setSelectedTopic('random');
          setLoading(false);
          return;
        }
        prompt = `Generate a ${exerciseType} exercise specifically about: ${topic.name} (${topic.category}).`;
      }

      prompt += `\n\nIMPORTANT: Respond ONLY with the exercise JSON in this exact format, nothing else:
[EXERCISE: {"type": "${exerciseType}", "question": "...", ${exerciseType === 'multiple-choice' ? '"options": ["A", "B", "C", "D"], ' : ''}"correctAnswer": "...", "topic": "Topic Name", "level": "A1-C2"}]`;

      const response = await profileFetch(profileApiUrl('/spanish/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });

      const data = await response.json();
      
      // Парсинг упражнения — prefer server-extracted, fallback to balanced parser
      if (data.exercise) {
        setCurrentExercise(data.exercise);
      } else {
        const parsed = parseExerciseTag(data.response);
        if (parsed) {
          setCurrentExercise(parsed.exercise);
        } else {
          console.error('No exercise found in response');
          alert('Failed to generate exercise. Please try again.');
        }
      }
    } catch (error) {
      console.error('Error generating exercise:', error);
      alert('Error generating exercise. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const checkAnswer = async () => {
    if (!currentExercise) return;
    
    let answer = '';
    if (exerciseType === 'multiple-choice') {
      answer = selectedOption;
    } else {
      answer = userAnswer.trim();
    }
    
    if (!answer) return;
    
    const correct = answer.toLowerCase() === currentExercise.correctAnswer.toLowerCase();
    setIsCorrect(correct);
    setShowResult(true);
    
    // Обновляем статистику
    setStats(prev => ({
      correct: prev.correct + (correct ? 1 : 0),
      incorrect: prev.incorrect + (correct ? 0 : 1)
    }));
    
    // Отправляем результат в backend для обновления прогресса
    try {
      await profileFetch(profileApiUrl('/spanish/api/topics/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: currentExercise.topic,
          category: 'Practice',
          level: currentExercise.level,
          success: correct
        }),
      });
      fetchTopics(); // Обновляем список тем
    } catch (error) {
      console.error('Error updating topic:', error);
    }
  };

  const resetExercise = () => {
    setCurrentExercise(null);
    setUserAnswer('');
    setSelectedOption(null);
    setShowResult(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <VerbConjugationDrills />

      {/* Статистика */}
      <div className="bg-white rounded-2xl shadow-2xl p-6">
        <h2 className="text-3xl font-bold text-gray-800 mb-4 flex items-center">
          <Brain className="h-8 w-8 mr-3 text-purple-600" />
          Practice Exercises
        </h2>
        
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-r from-purple-100 to-purple-200 rounded-xl p-4">
            <div className="flex items-center space-x-3">
              <Award className="h-8 w-8 text-purple-700" />
              <div>
                <p className="text-sm text-purple-700">Total</p>
                <p className="text-2xl font-bold text-purple-900">
                  {stats.correct + stats.incorrect}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-green-100 to-green-200 rounded-xl p-4">
            <div className="flex items-center space-x-3">
              <CheckCircle className="h-8 w-8 text-green-700" />
              <div>
                <p className="text-sm text-green-700">Correct</p>
                <p className="text-2xl font-bold text-green-900">{stats.correct}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-red-100 to-red-200 rounded-xl p-4">
            <div className="flex items-center space-x-3">
              <XCircle className="h-8 w-8 text-red-700" />
              <div>
                <p className="text-sm text-red-700">Incorrect</p>
                <p className="text-2xl font-bold text-red-900">{stats.incorrect}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Настройки упражнения */}
      <div className="bg-white rounded-2xl shadow-2xl p-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
          <Target className="h-6 w-6 mr-2 text-pink-600" />
          Exercise Settings
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Тип упражнения */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Exercise Type
            </label>
            <select
              value={exerciseType}
              onChange={(e) => setExerciseType(e.target.value)}
              className="w-full px-4 py-3 bg-purple-50 border-2 border-purple-300 rounded-xl focus:outline-none focus:border-purple-500 font-medium"
            >
              <option value="multiple-choice">📝 Multiple Choice (Quiz)</option>
              <option value="fill-blank">✍️ Fill in the Blank</option>
              <option value="open">💭 Open Question</option>
            </select>
          </div>
          
          {/* Выбор темы */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Topic
            </label>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="w-full px-4 py-3 bg-pink-50 border-2 border-pink-300 rounded-xl focus:outline-none focus:border-pink-500 font-medium"
            >
              <option value="random">🎲 Random Topic</option>
              <option value="weak">🎯 Focus on Weak Topics</option>
              {topics.length > 0 && <option disabled>────────────</option>}
              {topics.map(topic => (
                <option key={topic.id} value={topic.id}>
                  {topic.name} (Score: {topic.score.toFixed(0)})
                </option>
              ))}
            </select>
          </div>
        </div>
        
        <button
          onClick={generateExercise}
          disabled={loading}
          className="w-full px-6 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg font-bold text-lg flex items-center justify-center space-x-3"
        >
          {loading ? (
            <>
              <RefreshCw className="h-6 w-6 animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <TrendingUp className="h-6 w-6" />
              <span>Generate New Exercise</span>
            </>
          )}
        </button>
      </div>

      {/* Упражнение */}
      {currentExercise && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 md:border-4 border-purple-300 rounded-2xl p-5 md:p-8 shadow-2xl">
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className="px-3 py-1 sm:px-4 sm:py-2 bg-purple-300 text-purple-900 rounded-full text-xs sm:text-sm font-bold">
              {currentExercise.type === 'multiple-choice' ? '📝 Quiz' : 
               currentExercise.type === 'fill-blank' ? '✍️ Fill-in' : '💭 Open'}
            </span>
            <span className="px-3 py-1 sm:px-4 sm:py-2 bg-pink-300 text-pink-900 rounded-full text-xs sm:text-sm font-bold">
              {currentExercise.level}
            </span>
            <span className="px-3 py-1 sm:px-4 sm:py-2 bg-indigo-300 text-indigo-900 rounded-full text-xs sm:text-sm font-bold">
              {currentExercise.topic}
            </span>
          </div>
          
          <div className="bg-white rounded-xl p-4 sm:p-6 mb-6 border-2 border-purple-200">
            <p className="text-xl sm:text-2xl font-bold text-gray-800 leading-relaxed">
              {currentExercise.question}
            </p>
          </div>
          
          {/* Multiple Choice */}
          {currentExercise.type === 'multiple-choice' && !showResult && (
            <div className="space-y-3 mb-6">
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
          
          {/* Multiple Choice - Результат */}
          {currentExercise.type === 'multiple-choice' && showResult && (
            <div className="space-y-3 mb-6">
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
                    <CheckCircle className="inline ml-2 h-5 w-5 sm:h-6 sm:w-6 text-green-700 align-middle" />
                  )}
                  {option === selectedOption && option.toLowerCase() !== currentExercise.correctAnswer.toLowerCase() && (
                    <XCircle className="inline ml-2 h-5 w-5 sm:h-6 sm:w-6 text-red-700 align-middle" />
                  )}
                </div>
              ))}
            </div>
          )}
          
          {/* Fill-blank / Open */}
          {(currentExercise.type === 'fill-blank' || currentExercise.type === 'open') && (
            <div className="mb-6">
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
            </div>
          )}
          
          {/* Кнопки */}
          {!showResult ? (
            <button
              onClick={checkAnswer}
              disabled={
                (currentExercise.type === 'multiple-choice' && !selectedOption) ||
                ((currentExercise.type === 'fill-blank' || currentExercise.type === 'open') && !userAnswer.trim())
              }
              className="w-full px-6 py-3.5 sm:px-8 sm:py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg font-bold text-lg sm:text-xl"
            >
              ✓ Check Answer
            </button>
          ) : (
            <div className="space-y-4">
              {/* Результат */}
              <div className={`p-4 sm:p-6 rounded-xl border-2 sm:border-3 ${
                isCorrect
                  ? 'bg-green-100 border-green-500 text-green-900'
                  : 'bg-orange-100 border-orange-500 text-orange-900'
              }`}>
                {isCorrect ? (
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="h-8 w-8 sm:h-10 sm:w-10 text-green-600" />
                    <div>
                      <p className="text-xl sm:text-2xl font-bold">Correct! 🎉</p>
                      <p className="text-sm sm:text-lg">Great job! Keep it up!</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center space-x-3">
                    <XCircle className="h-8 w-8 sm:h-10 sm:w-10 text-orange-600" />
                    <div>
                      <p className="text-xl sm:text-2xl font-bold">Not quite right</p>
                      <p className="text-sm sm:text-lg">
                        The correct answer is: <span className="font-bold underline">{currentExercise.correctAnswer}</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Следующее упражнение */}
              <button
                onClick={resetExercise}
                className="w-full px-6 py-3.5 sm:px-8 sm:py-4 bg-gradient-to-r from-purple-50 to-pink-50 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all shadow-md hover:shadow-lg font-bold text-lg sm:text-xl flex items-center justify-center space-x-2 sm:space-x-3"
              >
                <RefreshCw className="h-5 w-5 sm:h-6 sm:w-6" />
                <span>Next Exercise</span>
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Подсказка если нет упражнения */}
      {!currentExercise && !loading && (
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-300 rounded-2xl p-8 text-center">
          <Brain className="h-16 w-16 mx-auto text-blue-600 mb-4" />
          <h3 className="text-2xl font-bold text-blue-900 mb-2">Ready to practice?</h3>
          <p className="text-blue-800 text-lg">
            Choose your settings above and click "Generate New Exercise" to start!
          </p>
        </div>
      )}
    </div>
  );
}

export default Exercises;
