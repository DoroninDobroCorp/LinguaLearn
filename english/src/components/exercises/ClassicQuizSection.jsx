import React, { useState, useEffect } from 'react';
import { 
  Brain, RefreshCw, Check, Target, Trophy, ListOrdered, 
  Sparkles, ArrowRight, Volume2 
} from 'lucide-react';
import ExamModal from '../ExamModal';
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

export default function ClassicQuizSection({ allTopics = [], onTopicUpdated }) {
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

  const [examModalConfig, setExamModalConfig] = useState({
    isOpen: false,
    level: 'A1',
    examType: 'custom',
    topicIds: []
  });

  useEffect(() => {
    const levelTopics = allTopics.filter(t => t.level === selectedLevel);
    setAvailableTopics(levelTopics);
    if (levelTopics.length > 0) {
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
        return next.length > 0 ? next : prev;
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
      {/* Topic Selector & Exam Launcher Bar */}
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

        {/* Expandable Topic Selector */}
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

      {/* Active Exercise Question Card */}
      {currentEx && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-gray-100 space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4 text-xs font-bold text-gray-500">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-md bg-purple-100 text-purple-800">
                {currentEx.level || selectedLevel}
              </span>
              <span className="text-gray-800">{currentEx.topic}</span>
            </div>
            <span>Вопрос {currentIndex + 1} из {exercises.length}</span>
          </div>

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
