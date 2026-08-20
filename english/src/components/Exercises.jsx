import React, { useState, useEffect, useRef } from 'react';
import { 
  Brain, RefreshCw, CheckCircle, XCircle, Award, 
  Layers, Infinity as InfinityIcon, Globe, Check, Search
} from 'lucide-react';

function parseExerciseTag(tag) {
  if (!tag) return { rawTopicName: 'General Practice', topicLevel: 'B1' };
  const match = tag.match(/^(.*?)(?:\s*\((A1|A2|B1|B2|C1|C2)\))?$/);
  if (match) {
    return {
      rawTopicName: match[1].trim(),
      topicLevel: match[2] || 'B1'
    };
  }
  return { rawTopicName: tag, topicLevel: 'B1' };
}

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

  return false;
}

// ----------------------------------------------------
// 1. AI GRAMMAR & VOCABULARY EXERCISES (GEMINI 3.7 FLASH)
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

  const fetchExerciseBatch = async () => {
    const response = await fetch('/english/api/exercises/generate', {
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
      console.error('Error generating English exercise batch:', error);
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
      await fetch('/english/api/topics/update', {
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
      await fetch(`/english/api/topics/${targetId}/set-score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score })
      });
      setScoreFeedback(score === 100 ? 'Topic marked as 100% ✅' : 'Topic marked as 0% ⭕');
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
              <Brain className="h-8 w-8 mr-3 text-indigo-600" />
              AI Grammar & Vocabulary Exercises
            </h2>
            <p className="text-gray-600 mt-2 text-sm sm:text-base">
              Practice 10-task nuanced English exercises based on your curriculum (up to {maxLevel})
            </p>
          </div>
          
          <div className="grid grid-cols-3 gap-3 md:flex md:space-x-4">
            <div className="bg-indigo-100 rounded-xl p-3 md:p-4 text-center">
              <p className="text-xs md:text-sm text-indigo-600 font-semibold">Completed</p>
              <p className="text-xl md:text-2xl font-bold text-indigo-950">{overallStats.total}</p>
            </div>
            <div className="bg-green-100 rounded-xl p-3 md:p-4 text-center">
              <p className="text-xs md:text-sm text-green-600 font-semibold">Correct</p>
              <p className="text-xl md:text-2xl font-bold text-green-950">{overallStats.correct}</p>
            </div>
            <div className="bg-orange-100 rounded-xl p-3 md:p-4 text-center">
              <p className="text-xs md:text-sm text-orange-600 font-semibold">Streak</p>
              <p className="text-xl md:text-2xl font-bold text-orange-950">🔥 {overallStats.streak}</p>
            </div>
          </div>
        </div>

        {/* Filters with visible percentage */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Topic</label>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="w-full px-4 py-3 border-2 border-indigo-300 rounded-xl focus:border-indigo-500 focus:outline-none font-medium text-sm"
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
              className="w-full px-4 py-3 border-2 border-indigo-300 rounded-xl focus:border-indigo-500 focus:outline-none font-medium text-sm"
            >
              <option value="all">🎲 All Types (Mix)</option>
              <option value="multiple-choice">📝 Multiple Choice</option>
              <option value="fill-blank">✍️ Fill in the Blank</option>
              <option value="open">💭 Open Answer</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Session Mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSessionMode('ten')}
                className={`px-3 py-3 rounded-xl border-2 font-bold transition-all text-xs flex items-center justify-center gap-1.5 ${
                  sessionMode === 'ten'
                    ? 'bg-indigo-600 border-indigo-700 text-white shadow-md'
                    : 'bg-white border-indigo-200 text-gray-700 hover:border-indigo-400'
                }`}
              >
                <Layers className="h-4 w-4" />
                <span>10 Tasks</span>
              </button>

              <button
                type="button"
                onClick={() => setSessionMode('endless')}
                className={`px-3 py-3 rounded-xl border-2 font-bold transition-all text-xs flex items-center justify-center gap-1.5 ${
                  sessionMode === 'endless'
                    ? 'bg-purple-600 border-purple-700 text-white shadow-md'
                    : 'bg-white border-purple-200 text-gray-700 hover:border-purple-400'
                }`}
              >
                <InfinityIcon className="h-4 w-4" />
                <span>Endless</span>
              </button>
            </div>
          </div>
        </div>

        {(!currentExercise || isRoundFinished) && (
          <button
            onClick={startNewBatch}
            disabled={loading}
            className="w-full px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 font-bold text-lg flex items-center justify-center space-x-3 transition-all shadow-md hover:shadow-lg"
          >
            {loading ? (
              <>
                <RefreshCw className="h-6 w-6 animate-spin" />
                <span>Generating 10 nuanced exercises with Gemini 3.7 Flash...</span>
              </>
            ) : (
              <>
                <Brain className="h-6 w-6" />
                <span>{isRoundFinished ? '🔄 Start New 10-Task Round' : '🚀 Start Workout (10 Tasks)'}</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Round Finished Screen */}
      {isRoundFinished && (
        <div className="bg-gradient-to-r from-indigo-100 to-purple-100 border-4 border-indigo-400 rounded-2xl p-6 md:p-10 shadow-2xl text-center space-y-6 animate-fade-in">
          <div className="inline-flex p-4 bg-indigo-600 text-white rounded-full shadow-lg">
            <Award className="h-12 w-12" />
          </div>
          <div>
            <h3 className="text-3xl font-black text-gray-900">10-Task Round Complete! 🎉</h3>
            <p className="text-gray-700 mt-2 text-lg">You have successfully practiced diverse nuances of this grammar rule.</p>
          </div>

          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-indigo-200">
              <p className="text-xs text-gray-500 font-bold uppercase">Correct</p>
              <p className="text-2xl font-black text-green-600">{roundStats.correct} / 10</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-indigo-200">
              <p className="text-xs text-gray-500 font-bold uppercase">Accuracy</p>
              <p className="text-2xl font-black text-indigo-700">{roundAccuracy}%</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-indigo-200">
              <p className="text-xs text-gray-500 font-bold uppercase">Streak</p>
              <p className="text-2xl font-black text-orange-600">🔥 {overallStats.streak}</p>
            </div>
          </div>

          {/* Manual Topic Score Controls on Round Summary */}
          <div className="pt-2 space-y-3">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Rate this topic:</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => handleSetTopicScore(100)}
                className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-sm transition-all shadow-md hover:shadow-lg flex items-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                <span>Mark Topic as 100%</span>
              </button>

              <button
                type="button"
                onClick={() => handleSetTopicScore(0)}
                className="px-4 py-2.5 bg-white border-2 border-gray-300 hover:border-gray-400 text-gray-700 font-bold rounded-xl text-sm transition-all shadow-sm flex items-center gap-2"
              >
                <span>⭕ Mark Topic as 0%</span>
              </button>
            </div>

            {scoreFeedback && (
              <p className="text-sm font-bold text-indigo-900 bg-white/90 py-1.5 px-4 rounded-lg inline-block border border-indigo-300 shadow-sm animate-fade-in">
                {scoreFeedback}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-2">
            <button
              onClick={startNewBatch}
              disabled={loading}
              className="px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
              <span>More 10 Tasks on This Topic</span>
            </button>
            <button
              onClick={() => { setSelectedTopic('all'); startNewBatch(); }}
              disabled={loading}
              className="px-6 py-3.5 bg-white border-2 border-indigo-300 text-indigo-900 font-bold rounded-xl shadow-sm hover:bg-indigo-50 transition-all flex items-center justify-center space-x-2"
            >
              <span>🎲 Try Another Topic</span>
            </button>
          </div>
        </div>
      )}

      {/* Active Exercise Card */}
      {currentExercise && !isRoundFinished && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-4 border-indigo-300 rounded-2xl p-5 md:p-8 shadow-2xl space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm font-bold text-indigo-950">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-xs">
                  {sessionMode === 'ten' ? `Task ${currentStep} of 10` : `Task #${currentStep}`}
                </span>
                {sessionMode === 'endless' && (
                  <span className="text-xs text-purple-700 font-semibold flex items-center gap-1">
                    <InfinityIcon className="h-3.5 w-3.5" /> Endless Mode
                  </span>
                )}
              </div>
              <span className="text-xs font-semibold text-indigo-700">
                Round: {roundStats.correct} correct
              </span>
            </div>

            {sessionMode === 'ten' && (
              <div className="w-full bg-indigo-200 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-600 to-purple-500 transition-all duration-500 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 bg-indigo-300 text-indigo-900 rounded-full text-xs font-bold">
              {currentExercise.type === 'multiple-choice' ? '📝 Quiz' : 
               currentExercise.type === 'fill-blank' ? '✍️ Fill-in' : '💭 Open'}
            </span>
            <span className="px-3 py-1 bg-pink-300 text-pink-900 rounded-full text-xs font-bold">
              {currentExercise.level}
            </span>
            <span className="px-3 py-1 bg-purple-300 text-purple-900 rounded-full text-xs font-bold">
              {currentExercise.topic}
            </span>
            {currentExercise.sourceLabel && (
              <span className="px-3 py-1 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-full text-xs font-bold">
                📚 {currentExercise.sourceLabel}
              </span>
            )}
            {currentExercise.targetWord && (
              <span className="px-3 py-1 bg-amber-100 border border-amber-300 text-amber-900 rounded-full text-xs font-bold">
                🎯 Word: {currentExercise.targetWord}
              </span>
            )}
          </div>
          
          <div className="bg-white rounded-xl p-4 sm:p-6 border-2 border-indigo-200">
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
                      ? 'bg-indigo-300 border-indigo-600 text-indigo-900 scale-[1.02] shadow-md'
                      : 'bg-white border-indigo-300 hover:border-indigo-500 text-gray-800 hover:scale-[1.01]'
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
                    : 'border-indigo-400 focus:border-indigo-600 focus:outline-none bg-white'
                }`}
              />
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

                <div className="bg-white/80 p-3 rounded-lg border border-indigo-200 mt-2 space-y-1">
                  {Array.isArray(currentExercise.alternativeAnswers) && currentExercise.alternativeAnswers.length > 0 && (
                    <p className="text-xs text-gray-700 font-semibold">
                      Also acceptable: <span className="font-bold text-indigo-950">{currentExercise.alternativeAnswers.join(' / ')}</span>
                    </p>
                  )}
                  {currentExercise.explanation && (
                    <p className="text-sm sm:text-base font-medium text-gray-800">{currentExercise.explanation}</p>
                  )}
                </div>
              </div>
              
              <button
                onClick={nextExercise}
                className="w-full px-6 py-3.5 sm:px-8 sm:py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all shadow-md hover:shadow-lg font-bold text-lg sm:text-xl flex items-center justify-center space-x-2"
              >
                <RefreshCw className="h-5 w-5 sm:h-6 sm:w-6" />
                <span>{sessionMode === 'ten' && currentIndex >= 9 ? '🏆 Finish Round (10/10)' : 'Next Task →'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 2. FULL SENTENCE TRANSLATION MODE COMPONENT (LAST TAB IN ENGLISH)
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
    const response = await fetch('/english/api/exercises/generate-translation', {
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
      console.error('Error generating English translation batch:', error);
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

    // Record progress for selected topics
    const targetIds = selectedTopicIds.length > 0 ? selectedTopicIds : [];
    try {
      if (targetIds.length > 0) {
        for (const tid of targetIds) {
          await fetch('/english/api/topics/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topicId: tid,
              success: correct
            })
          });
        }
      } else if (current.testedGrammar) {
        await fetch('/english/api/topics/update', {
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
        await fetch(`/english/api/topics/${id}/set-score`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ score })
        });
      }
      setScoreFeedback(score === 100 ? 'Selected topics marked as 100% ✅' : 'Selected topics marked as 0% ⭕');
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
              <Globe className="h-8 w-8 mr-3 text-indigo-600" />
              Full Sentence Translation Mode
            </h2>
            <p className="text-gray-600 mt-2 text-sm sm:text-base">
              Translate whole meaningful sentences composed from your <span className="font-semibold text-indigo-700">mastered vocabulary</span> across chosen grammar topics.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 md:flex md:space-x-4">
            <div className="bg-indigo-100 rounded-xl p-3 md:p-4 text-center">
              <p className="text-xs md:text-sm text-indigo-700 font-semibold">Completed</p>
              <p className="text-xl md:text-2xl font-bold text-indigo-950">{overallStats.total}</p>
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

        {/* Topic Multi-Selection */}
        <div className="space-y-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="block text-sm font-semibold text-gray-700">
              Grammar Topics for Practice ({selectedTopicIds.length > 0 ? `${selectedTopicIds.length} selected` : 'Random / All'}):
            </label>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={selectRandomTopics}
                className="px-2.5 py-1 text-xs font-semibold bg-indigo-100 text-indigo-800 rounded-lg hover:bg-indigo-200 transition-colors"
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
                placeholder="Search topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500"
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
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {lvl.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

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
                      ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400'
                      : 'bg-white border border-gray-300 text-gray-800 hover:border-indigo-400 hover:bg-indigo-50/50'
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
                      ? 'bg-indigo-800 text-indigo-100'
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

          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-semibold text-gray-700">Session Mode:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSessionMode('ten')}
                className={`px-3 py-1.5 rounded-xl border-2 font-bold transition-all text-xs flex items-center gap-1.5 ${
                  sessionMode === 'ten'
                    ? 'bg-indigo-600 border-indigo-700 text-white shadow-sm'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-indigo-400'
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
                    ? 'bg-purple-600 border-purple-700 text-white shadow-md'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-purple-400'
                }`}
              >
                <InfinityIcon className="h-4 w-4" />
                <span>Endless</span>
              </button>
            </div>
          </div>
        </div>

        {(!current || isRoundFinished) && (
          <button
            onClick={startNewBatch}
            disabled={loading}
            className="w-full px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 font-bold text-lg flex items-center justify-center space-x-3 transition-all shadow-md hover:shadow-lg"
          >
            {loading ? (
              <>
                <RefreshCw className="h-6 w-6 animate-spin" />
                <span>Generating 10 sentences with Gemini 3.7 Flash...</span>
              </>
            ) : (
              <>
                <Globe className="h-6 w-6" />
                <span>{isRoundFinished ? '🔄 Start New 10-Sentence Round' : '🚀 Start Sentence Translation (Batch of 10)'}</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Round Finished Screen */}
      {isRoundFinished && (
        <div className="bg-gradient-to-r from-indigo-100 to-purple-100 border-4 border-indigo-400 rounded-2xl p-6 md:p-10 shadow-2xl text-center space-y-6 animate-fade-in">
          <div className="inline-flex p-4 bg-indigo-600 text-white rounded-full shadow-lg">
            <Award className="h-12 w-12" />
          </div>
          <div>
            <h3 className="text-3xl font-black text-gray-900">10-Sentence Translation Round Complete! 🎉</h3>
            <p className="text-gray-700 mt-2 text-lg">You have translated complete sentences applying your target grammar and vocabulary.</p>
          </div>

          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-indigo-200">
              <p className="text-xs text-gray-500 font-bold uppercase">Correct</p>
              <p className="text-2xl font-black text-indigo-600">{roundStats.correct} / 10</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-indigo-200">
              <p className="text-xs text-gray-500 font-bold uppercase">Accuracy</p>
              <p className="text-2xl font-black text-purple-700">{roundAccuracy}%</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-indigo-200">
              <p className="text-xs text-gray-500 font-bold uppercase">Streak</p>
              <p className="text-2xl font-black text-orange-600">🔥 {overallStats.streak}</p>
            </div>
          </div>

          {/* Manual Topic Score Controls on Translation Round Summary */}
          {selectedTopicIds.length > 0 && (
            <div className="pt-2 space-y-3">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Rate selected topics:</p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => handleSetTopicScore(100)}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>Mark Topics as 100%</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSetTopicScore(0)}
                  className="px-4 py-2.5 bg-white border-2 border-gray-300 hover:border-gray-400 text-gray-700 font-bold rounded-xl text-sm transition-all shadow-sm flex items-center gap-2"
                >
                  <span>⭕ Mark Topics as 0%</span>
                </button>
              </div>

              {scoreFeedback && (
                <p className="text-sm font-bold text-indigo-900 bg-white/90 py-1.5 px-4 rounded-lg inline-block border border-indigo-300 shadow-sm animate-fade-in">
                  {scoreFeedback}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-2">
            <button
              onClick={startNewBatch}
              disabled={loading}
              className="px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
              <span>More 10 Sentences</span>
            </button>
            <button
              onClick={() => { selectRandomTopics(); startNewBatch(); }}
              disabled={loading}
              className="px-6 py-3.5 bg-white border-2 border-indigo-300 text-indigo-900 font-bold rounded-xl shadow-sm hover:bg-indigo-50 transition-all flex items-center justify-center space-x-2"
            >
              <span>🎲 Change Topics & Continue</span>
            </button>
          </div>
        </div>
      )}

      {/* Active Translation Exercise Card */}
      {current && !isRoundFinished && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 md:border-4 border-indigo-300 rounded-2xl p-5 md:p-8 shadow-2xl space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm font-bold text-indigo-950">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-xs">
                  {sessionMode === 'ten' ? `Sentence ${currentStep} of 10` : `Sentence #${currentStep}`}
                </span>
                {sessionMode === 'endless' && (
                  <span className="text-xs text-purple-700 font-semibold flex items-center gap-1">
                    <InfinityIcon className="h-3.5 w-3.5" /> Endless Mode
                  </span>
                )}
              </div>
              <span className="text-xs font-semibold text-indigo-700">
                Round: {roundStats.correct} correct
              </span>
            </div>

            {sessionMode === 'ten' && (
              <div className="w-full bg-indigo-200 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-600 to-purple-500 transition-all duration-500 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 bg-indigo-200 text-indigo-950 rounded-full text-xs font-bold flex items-center gap-1">
              <Globe className="h-3 w-3" /> English Translation
            </span>
            {current.testedGrammar && (
              <span className="px-3 py-1 bg-purple-200 text-purple-950 rounded-full text-xs font-bold">
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
                🎯 Words: {current.usedVocabulary.join(', ')}
              </span>
            )}
          </div>

          <div className="bg-white rounded-xl p-5 md:p-6 border-2 border-indigo-200 shadow-sm">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Translate to English:</p>
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
              placeholder="Type your complete English translation..."
              className={`w-full px-4 py-3 sm:px-5 sm:py-4 rounded-xl border-2 sm:border-3 text-lg font-medium resize-none ${
                showResult
                  ? isCorrect
                    ? 'bg-green-100 border-green-600 text-green-950'
                    : 'bg-red-100 border-red-600 text-red-950'
                  : 'border-indigo-400 focus:border-indigo-600 focus:outline-none bg-white'
              }`}
            />
          </div>

          {!showResult ? (
            <button
              onClick={checkAnswer}
              disabled={!userTranslation.trim()}
              className="w-full px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-xl transition-all shadow-md hover:shadow-lg"
            >
              ✓ Check Translation
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
                        <p className="text-xl sm:text-2xl font-bold">Great job! Translation is correct 🎉</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-8 w-8 text-orange-600 flex-shrink-0" />
                      <div>
                        <p className="text-xl sm:text-2xl font-bold">Not quite accurate</p>
                      </div>
                    </>
                  )}
                </div>

                <div className="bg-white/80 p-4 rounded-xl space-y-2 border border-indigo-200/80 text-gray-900">
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase">Target Translation:</p>
                    <p className="text-lg font-extrabold text-indigo-950">{current.targetSentence}</p>
                  </div>

                  {Array.isArray(current.alternativeAnswers) && current.alternativeAnswers.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase">Also acceptable:</p>
                      <p className="text-sm font-semibold text-gray-800">{current.alternativeAnswers.join(' / ')}</p>
                    </div>
                  )}

                  {current.explanation && (
                    <div className="pt-2 border-t border-gray-200">
                      <p className="text-xs font-bold text-gray-500 uppercase">Grammar & Syntax Breakdown:</p>
                      <p className="text-sm font-medium text-gray-800 leading-relaxed mt-0.5">{current.explanation}</p>
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={nextExercise}
                className="w-full px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 font-bold text-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center space-x-2"
              >
                <RefreshCw className="h-5 w-5" />
                <span>{sessionMode === 'ten' && currentIndex >= 9 ? '🏆 Finish Round (10/10)' : 'Next Sentence →'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 3. MAIN EXERCISES CONTAINER COMPONENT (ENGLISH)
// Order of tabs: 1. Grammar Tests, 2. Sentence Translation
// ----------------------------------------------------
function Exercises() {
  const [activeTab, setActiveTab] = useState('grammar');
  const [topics, setTopics] = useState([]);
  const [maxLevel, setMaxLevel] = useState('B2');

  useEffect(() => {
    loadTopics();
  }, []);

  const loadTopics = async () => {
    try {
      const response = await fetch('/english/api/curriculum');
      const data = await response.json();
      setTopics(data.topics || []);
      if (data.maxLevel) setMaxLevel(data.maxLevel);
    } catch (error) {
      console.error('Error loading topics:', error);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Mode Selector Tabs in requested order: 1. Grammar Tests, 2. Sentence Translation */}
      <div className="bg-white p-2 rounded-2xl shadow-md flex flex-wrap sm:flex-nowrap gap-2 border-2 border-gray-100">
        <button
          onClick={() => setActiveTab('grammar')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all ${
            activeTab === 'grammar'
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Brain className="h-5 w-5" />
          <span>🧠 Grammar Tests</span>
        </button>

        <button
          onClick={() => setActiveTab('translation')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all ${
            activeTab === 'translation'
              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Globe className="h-5 w-5" />
          <span>🌐 Sentence Translation</span>
        </button>
      </div>

      {activeTab === 'grammar' && (
        <GrammarExercisesSection topics={topics} maxLevel={maxLevel} onTopicUpdated={loadTopics} />
      )}

      {activeTab === 'translation' && (
        <SentenceTranslationExerciseSection topics={topics} onTopicUpdated={loadTopics} />
      )}
    </div>
  );
}

export default Exercises;
