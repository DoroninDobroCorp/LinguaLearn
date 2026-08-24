import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, Target, Trophy, ListOrdered, Check, Volume2, ArrowRight 
} from 'lucide-react';
import ExamModal from '../ExamModal';
import { profileApiUrl, profileFetch } from '../../utils/api';
import { soundEngine, speakSpanish } from '../../utils/soundEffects';

export default function ClassicQuizSection({ topicIds = [] }) {
  const [availableTopics, setAvailableTopics] = useState([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState(topicIds.length > 0 ? topicIds : [1, 27]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showTopicSelector, setShowTopicSelector] = useState(false);

  const [exercises, setExercises] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [userFillAnswer, setUserFillAnswer] = useState('');
  const [isAnswered, setIsAnswered] = useState(false);
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [error, setError] = useState('');
  
  const [examModalConfig, setExamModalConfig] = useState({
    isOpen: false,
    level: 'A1',
    examType: 'custom',
    topicIds: []
  });

  const attemptEventRef = useRef(null);
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    const fetchTopics = async () => {
      try {
        const res = await profileFetch(profileApiUrl('/spanish/api/curriculum/topics?level=A1'));
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data.topics) ? data.topics : Array.isArray(data) ? data : [];
          setAvailableTopics(list.filter(t => t.level === 'A1' || !t.level));
        }
      } catch (err) {
        console.warn('Could not load topics list:', err);
      }
    };
    fetchTopics();
  }, []);

  const fetchExercises = async (customIds = selectedTopicIds, isAi = false) => {
    try {
      if (isAi) setIsGeneratingAi(true);
      else setLoading(true);
      setError('');

      if (isAi) {
        const res = await profileFetch(profileApiUrl('/spanish/api/exercises/generate-batch'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            level: 'A1',
            topicIds: customIds,
            count: 10
          })
        });
        const data = await res.json();
        if (res.ok && Array.isArray(data.exercises) && data.exercises.length > 0) {
          setExercises(data.exercises);
          setCurrentIndex(0);
          soundEngine.playLevelUp();
        } else {
          throw new Error(data.error || 'Не удалось сгенерировать упражнения через ИИ');
        }
      } else {
        const params = new URLSearchParams({ level: 'A1', category: 'Grammar', adaptive: '1', count: '20' });
        if (customIds.length > 0) params.set('topicIds', customIds.join(','));
        const res = await profileFetch(profileApiUrl(`/spanish/api/exercises?${params.toString()}`));
        const data = await res.json().catch(() => []);
        if (!res.ok) throw new Error(data.error || 'Не удалось загрузить упражнения');
        setExercises(Array.isArray(data) ? data : []);
        setCurrentIndex(0);
      }

      startedAtRef.current = Date.now();
    } catch (err) {
      console.error('Error fetching exercises:', err);
      setError(err.message || 'Не удалось загрузить упражнения');
    } finally {
      setLoading(false);
      setIsGeneratingAi(false);
    }
  };

  useEffect(() => {
    setLoading(false);
  }, []);

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

  const handleSelectAllA1 = () => {
    const allIds = availableTopics.map(t => t.id);
    setSelectedTopicIds(allIds);
  };

  const handleSelectFirstFour = () => {
    const firstFour = availableTopics.slice(0, 4).map(t => t.id);
    setSelectedTopicIds(firstFour);
  };

  const currentEx = exercises[currentIndex];
  const isChoice = currentEx?.type === 'multiple-choice' || currentEx?.type === 'choice';
  const userAnswer = isChoice ? selectedOption : userFillAnswer.trim();

  const handleCheck = async () => {
    if (isAnswered || checking || !currentEx || !userAnswer) return;
    setChecking(true);
    setError('');
    if (!attemptEventRef.current) {
      attemptEventRef.current = globalThis.crypto?.randomUUID?.() || `practice-${currentEx.id}-${Date.now()}`;
    }
    try {
      const res = await profileFetch(profileApiUrl('/spanish/api/a1/practice/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: currentEx.topicId,
          exerciseId: currentEx.id,
          answer: userAnswer,
          eventId: attemptEventRef.current,
          responseMs: Date.now() - startedAtRef.current,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось проверить ответ');
      setResult(data);
      setIsAnswered(true);
      if (data.isCorrect) soundEngine.playCorrect();
      else soundEngine.playWrong();

      // Record / resolve mistake in grammar memory
      try {
        if (!data.isCorrect) {
          profileFetch(profileApiUrl('/spanish/api/exercises/record-mistake'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topicId: currentEx.topicId,
              topicName: currentEx.topic || currentEx.topicName,
              category: 'quiz',
              level: currentEx.level || selectedLevel || 'A1',
              prompt: currentEx.question || currentEx.prompt,
              userWrongAnswer: String(userAnswer),
              correctAnswer: data.correctAnswer || currentEx.correctAnswer || '',
              ruleExplanation: data.explanation || currentEx.explanation || ''
            })
          }).catch(() => {});
        } else {
          profileFetch(profileApiUrl('/spanish/api/exercises/resolve-mistake'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              category: 'quiz',
              prompt: currentEx.question || currentEx.prompt
            })
          }).catch(() => {});
        }
      } catch (e) {
        console.warn('Mistake tracking error in ClassicQuiz:', e);
      }

      window.dispatchEvent(new CustomEvent('gamification_updated'));
    } catch (err) {
      setError(err.message || 'Не удалось проверить ответ');
    } finally {
      setChecking(false);
    }
  };

  const handleNext = () => {
    setCurrentIndex(i => (i + 1) % exercises.length);
    setSelectedOption(null);
    setUserFillAnswer('');
    setIsAnswered(false);
    setResult(null);
    setError('');
    attemptEventRef.current = null;
    startedAtRef.current = Date.now();
  };

  const filteredTopics = availableTopics.filter(t => 
    !searchQuery.trim() || 
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Topic Selector & Exam Launcher Bar */}
      <div className="max-w-4xl mx-auto p-6 rounded-3xl bg-gradient-to-br from-purple-50 via-white to-fuchsia-50 dark:from-gray-800 dark:via-gray-800 dark:to-purple-950/30 border-2 border-purple-200 dark:border-gray-700 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-purple-600 text-white font-black text-sm">
                🧠 ИИ-Тренажер & Экзамены
              </span>
              <span className="text-xs font-bold text-purple-700 dark:text-purple-300">
                Выбрано тем: {selectedTopicIds.length}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Выберите любые темы курса для точечной тренировки или запуска официального экзамена от ИИ.
            </p>
          </div>

          <button
            onClick={() => setShowTopicSelector(!showTopicSelector)}
            className="px-4 py-2 rounded-xl border border-purple-300 dark:border-gray-600 bg-white dark:bg-gray-750 text-purple-700 dark:text-purple-300 font-bold text-xs hover:bg-purple-50 transition-all flex items-center justify-center gap-1.5 shadow-sm"
          >
            <ListOrdered className="w-4 h-4" />
            <span>{showTopicSelector ? 'Скрыть выбор тем ▲' : 'Выбрать темы (' + selectedTopicIds.length + ') ▼'}</span>
          </button>
        </div>

        {/* Action Buttons Row */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={() => fetchExercises(selectedTopicIds, true)}
            disabled={isGeneratingAi || loading}
            className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-black text-xs sm:text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-yellow-300" />
            <span>{isGeneratingAi ? 'Генерируем вопросы ИИ...' : 'Сгенерировать 10 вопросов ИИ ⚡'}</span>
          </button>

          <button
            onClick={() => setExamModalConfig({
              isOpen: true,
              level: 'A1',
              examType: 'custom',
              topicIds: selectedTopicIds
            })}
            className="py-3 px-5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-black text-xs sm:text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Target className="w-4 h-4" />
            <span>Свой экзамен (20 вопросов) 🎯</span>
          </button>

          <button
            onClick={() => setExamModalConfig({
              isOpen: true,
              level: 'A1',
              examType: 'level_mastery',
              topicIds: []
            })}
            className="py-3 px-5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black text-xs sm:text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Trophy className="w-4 h-4 text-yellow-200" />
            <span>Итоговый экзамен A1 (30 вопросов) 🏆</span>
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
                  onClick={handleSelectAllA1}
                  className="text-xs px-2.5 py-1 rounded-lg bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-bold hover:bg-purple-200"
                >
                  Выбрать все ({availableTopics.length})
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

      {/* Active Question Card */}
      {currentEx && (
        <div className="max-w-4xl mx-auto glass-card rounded-3xl p-6 sm:p-10 shadow-2xl border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 animate-fadeIn space-y-6">
          <div className="flex items-center justify-between border-b border-purple-100 dark:border-gray-700 pb-4 text-xs font-bold text-gray-500">
            <span className="px-2.5 py-1 rounded-md bg-purple-100 text-purple-800">Вопрос {currentIndex + 1} из {exercises.length}</span>
            <span>{currentEx.topic || 'Грамматика'}</span>
          </div>

          <div className="p-6 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-gray-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-purple-600 dark:text-purple-400">
                {isChoice ? 'Выберите вариант:' : 'Вставьте пропущенное слово:'}
              </span>
              <button
                type="button"
                onClick={() => speakSpanish(currentEx.question)}
                className="p-1.5 rounded-lg bg-white dark:bg-gray-700 text-purple-600 shadow-sm"
              >
                <Volume2 className="h-4 w-4" />
              </button>
            </div>
            <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">{currentEx.question}</p>
          </div>

          {isChoice ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentEx.options?.map((opt, idx) => {
                const isSelected = selectedOption === opt;
                let btnStyle = 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200';
                if (isAnswered) {
                  if (opt === currentEx.correctAnswer) {
                    btnStyle = 'bg-emerald-50 border-emerald-500 text-emerald-900 font-bold';
                  } else if (isSelected) {
                    btnStyle = 'bg-rose-50 border-rose-500 text-rose-900';
                  } else {
                    btnStyle = 'opacity-40';
                  }
                } else if (isSelected) {
                  btnStyle = 'bg-purple-50 border-purple-600 text-purple-900 font-bold ring-2 ring-purple-300';
                }

                return (
                  <button
                    key={idx}
                    onClick={() => !isAnswered && setSelectedOption(opt)}
                    disabled={isAnswered}
                    className={`p-4 rounded-xl border-2 text-left font-medium text-sm transition-all ${btnStyle}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          ) : (
            <input
              type="text"
              value={userFillAnswer}
              onChange={(e) => setUserFillAnswer(e.target.value)}
              placeholder="Введите ответ на испанском..."
              disabled={isAnswered}
              className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-200 dark:border-gray-600 dark:bg-gray-800 text-base font-semibold"
            />
          )}

          {isAnswered && result && (
            <div className={`p-4 rounded-xl border space-y-1.5 ${
              result.isCorrect ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}>
              <p className="font-bold text-sm">
                {result.isCorrect ? '✅ Верно!' : `❌ Правильный ответ: ${currentEx.correctAnswer}`}
              </p>
              {currentEx.explanation && <p className="text-xs text-gray-700">{currentEx.explanation}</p>}
            </div>
          )}

          <div className="flex justify-end pt-2">
            {!isAnswered ? (
              <button
                onClick={handleCheck}
                disabled={!userAnswer || checking}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-md text-sm"
              >
                Проверить ответ
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="px-6 py-3 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold rounded-xl shadow-lg text-sm flex items-center gap-2"
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
        />
      )}
    </div>
  );
}
