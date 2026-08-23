import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Award, CheckCircle2, XCircle, Clock, AlertCircle, 
  HelpCircle, ChevronRight, RefreshCw, Trophy, Sparkles, 
  Check, ArrowRight, ShieldCheck, BookmarkCheck, Volume2,
  RotateCcw, ListOrdered
} from 'lucide-react';
import { profileApiUrl, profileFetch } from '../utils/api';
import { useTheme } from '../contexts/ThemeContext';

export default function ExamModal({ level = 'A1', examType = 'milestone', topicIds = [], isOpen, onClose, onExamFinished }) {
  const { isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [examData, setExamData] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [selectedOption, setSelectedOption] = useState('');
  const [typedAnswer, setTypedAnswer] = useState('');
  
  const [startTime, setStartTime] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);

  const [submitting, setSubmitting] = useState(false);
  const [examResult, setExamResult] = useState(null);

  const SPANISH_SPECIAL_CHARS = ['á', 'é', 'í', 'ó', 'ú', 'ñ', '¿', '¡', 'Á', 'É', 'Í', 'Ó', 'Ú', 'Ñ'];

  const isAnswerCorrect = (userAns, correctAns, altAns = []) => {
    if (!userAns || typeof userAns !== 'string' || !userAns.trim()) return false;
    const clean = (str) =>
      String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[.,;:!?¡¿"'«»()—–\-_/\\]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const userClean = clean(userAns);
    const correctClean = clean(correctAns);
    if (userClean === correctClean) return true;

    if (Array.isArray(altAns)) {
      for (const alt of altAns) {
        if (clean(alt) === userClean) return true;
      }
    }
    return false;
  };

  useEffect(() => {
    if (isOpen) {
      startExam();
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isOpen, level, examType]);

  useEffect(() => {
    if (examData && !examResult) {
      const q = examData.questions[currentIndex];
      if (q) {
        if (q.type === 'multiple-choice') {
          setSelectedOption(userAnswers[q.id] || '');
        } else {
          setTypedAnswer(userAnswers[q.id] || '');
        }
      }
    }
  }, [currentIndex, examData]);

  // Keyboard shortcut listener for options (1,2,3,4)
  useEffect(() => {
    if (!isOpen || !examData || examResult || loading) return;

    const handleKeyDown = (e) => {
      const q = examData.questions[currentIndex];
      if (!q) return;

      if (q.type === 'multiple-choice' && q.options?.length > 0) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= q.options.length) {
          handleSelectOption(q.options[num - 1]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, examData, currentIndex, examResult, loading]);

  const startExam = async () => {
    setLoading(true);
    setExamResult(null);
    setCurrentIndex(0);
    setUserAnswers({});
    setSelectedOption('');
    setTypedAnswer('');
    setElapsedSeconds(0);
    setStartTime(Date.now());

    try {
      const res = await profileFetch(profileApiUrl('/spanish/api/exams/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level,
          examType,
          topicIds
        })
      });

      if (res.ok) {
        const data = await res.json();
        setExamData(data);
        // Start timer
        clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
          setElapsedSeconds((prev) => prev + 1);
        }, 1000);
      } else {
        const err = await res.json();
        alert(err.error || 'Ошибка генерации экзамена.');
        onClose();
      }
    } catch (err) {
      console.error('Error starting exam:', err);
      alert('Не удалось запустить экзамен. Проверьте подключение к серверу.');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleSpeak = (text) => {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  };

  const handleSelectOption = (opt) => {
    setSelectedOption(opt);
    const q = examData.questions[currentIndex];
    setUserAnswers((prev) => ({ ...prev, [q.id]: opt }));
  };

  const handleTypedChange = (val) => {
    setTypedAnswer(val);
    const q = examData.questions[currentIndex];
    setUserAnswers((prev) => ({ ...prev, [q.id]: val }));
  };

  const insertSpecialChar = (char) => {
    const nextVal = typedAnswer + char;
    handleTypedChange(nextVal);
  };

  const handleNext = () => {
    if (currentIndex < examData.questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (currentIndex < examData.questions.length - 1) {
        handleNext();
      } else {
        handleSubmitExam();
      }
    }
  };

  const handleSubmitExam = async () => {
    if (!examData || submitting) return;
    clearInterval(timerRef.current);
    setSubmitting(true);

    const answersPayload = examData.questions.map((q) => ({
      id: q.id,
      topicId: q.topicId,
      topicName: q.topicName,
      question: q.question,
      userAnswer: userAnswers[q.id] || '',
      correctAnswer: q.correctAnswer,
      alternativeAnswers: q.alternativeAnswers || [],
      explanation: q.explanation || ''
    }));

    try {
      const res = await profileFetch(profileApiUrl('/spanish/api/exams/submit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level,
          examType,
          topicIds: examData.topics?.map((t) => t.id) || [],
          answers: answersPayload,
          durationSeconds: elapsedSeconds
        })
      });

      if (res.ok) {
        const resultData = await res.json();
        setExamResult(resultData);
        if (typeof onExamFinished === 'function') {
          onExamFinished(resultData);
        }
      } else {
        alert('Ошибка при проверке экзамена.');
      }
    } catch (err) {
      console.error('Error submitting exam:', err);
      alert('Ошибка связи с сервером при отправке результатов.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const currentQ = examData?.questions?.[currentIndex];
  const totalQ = examData?.questions?.length || 0;
  const answeredCount = Object.keys(userAnswers).filter((k) => (userAnswers[k] || '').trim()).length;
  const isLastQuestion = currentIndex === totalQ - 1;

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const bgModal = isDark ? 'bg-slate-900 text-gray-100' : 'bg-white text-slate-900';
  const textHeading = isDark ? 'text-gray-100' : 'text-slate-900';
  const textBody = isDark ? 'text-gray-200' : 'text-slate-800';
  const textMuted = isDark ? 'text-gray-400' : 'text-slate-500';
  const optBgUnselected = isDark ? 'bg-slate-900/70 border-slate-700/80 text-gray-200 hover:bg-slate-800' : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 shadow-sm';
  const inputBg = isDark ? 'bg-slate-950 border-slate-700 text-gray-100 placeholder-gray-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400';
  const pillsContainerBg = isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-100 border-slate-200';
  const pillUnanswered = isDark ? 'bg-slate-800 text-gray-400 border-slate-700 hover:bg-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-200';

  const cardBg = isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200';
  const borderCol = isDark ? 'border-slate-700' : 'border-gray-200';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in overflow-hidden">
      <div className={`relative w-full max-w-3xl max-h-[94vh] flex flex-col rounded-2xl shadow-2xl border ${borderCol} ${bgModal}`}>
        
        {/* Header */}
        <div className={`flex items-center justify-between p-4 sm:p-5 border-b ${borderCol} flex-shrink-0`}>
          <div className="flex items-center space-x-3">
            <span className="p-2.5 rounded-xl bg-gradient-to-br from-amber-400 to-fuchsia-600 text-white shadow-md">
              {examType === 'level_mastery' ? <Trophy className="h-6 w-6" /> : <Award className="h-6 w-6" />}
            </span>
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30">
                  {level}
                </span>
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                  {examType === 'level_mastery' ? '🏆 Финальный экзамен уровня' : examType === 'custom' ? '🎯 Пользовательский экзамен (ИИ)' : '🎓 Промежуточный экзамен'}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight mt-0.5">
                {examType === 'level_mastery' 
                  ? `Аттестация по всему курсу ${level} (30 вопросов от ИИ)` 
                  : examType === 'custom'
                  ? `Экзамен по выбранным темам (${totalQ || 20} вопросов от ИИ)`
                  : `Промежуточный экзамен по изученным темам (20 вопросов)`}
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {!examResult && (
              <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-gray-300">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span>{formatTime(elapsedSeconds)}</span>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-slate-700/60 transition-all"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <RefreshCw className="h-10 w-10 text-fuchsia-500 animate-spin" />
              <div className="text-center space-y-1">
                <p className="text-base font-bold text-gray-200">Формируем персональный экзамен...</p>
                <p className="text-xs text-gray-400">Генерируем уникальные вопросы по изученным темам и словарю</p>
              </div>
            </div>
          ) : examResult ? (
            /* RESULTS SCREEN */
            <div className="space-y-6 animate-fade-in">
              {/* Top Banner */}
              <div className={`p-6 rounded-2xl text-center space-y-3 border shadow-xl ${
                examResult.passed 
                  ? 'bg-gradient-to-b from-emerald-950/40 via-slate-900 to-slate-900 border-emerald-500/40' 
                  : 'bg-gradient-to-b from-amber-950/40 via-slate-900 to-slate-900 border-amber-500/40'
              }`}>
                <div className="inline-flex p-4 rounded-full bg-slate-800/80 shadow-lg border border-slate-700 mb-1">
                  {examResult.passed ? (
                    <Trophy className="h-12 w-12 text-emerald-400 animate-bounce" />
                  ) : (
                    <AlertCircle className="h-12 w-12 text-amber-400" />
                  )}
                </div>

                <h3 className={`text-2xl sm:text-3xl font-black ${textHeading}`}>
                  {examResult.passed ? '🎉 Экзамен успешно сдан!' : 'Экзамен завершен — требуется закрепление'}
                </h3>

                <p className="text-sm text-gray-300 max-w-lg mx-auto">
                  {examResult.passed 
                    ? `Великолепный результат! Вы набрали ${examResult.scorePercent}% правильных ответов. Прогресс по темам обновлен!` 
                    : `Вы набрали ${examResult.scorePercent}% правильных ответов (для зачета нужно 80%+). Повторите темы, в которых были ошибки.`}
                </p>

                <div className="flex justify-center items-center space-x-6 pt-2">
                  <div className="text-center">
                    <p className="text-xs text-gray-400 uppercase font-semibold">Итоговый балл</p>
                    <p className={`text-3xl font-black ${examResult.passed ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {examResult.scorePercent}%
                    </p>
                  </div>
                  <div className="h-10 w-px bg-slate-700" />
                  <div className="text-center">
                    <p className="text-xs text-gray-400 uppercase font-semibold">Правильно</p>
                    <p className={`text-3xl font-black ${textHeading}`}>
                      {examResult.correctCount} / {examResult.totalQuestions}
                    </p>
                  </div>
                </div>
              </div>

              {/* Breakdown by Topic */}
              {examResult.breakdownByTopic?.length > 0 && (
                <div className={`p-4 sm:p-5 rounded-xl border ${cardBg} space-y-3`}>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center space-x-2">
                    <BookmarkCheck className="h-4 w-4 text-fuchsia-400" />
                    <span>Результаты по темам экзамена</span>
                  </h4>
                  <div className="space-y-2.5">
                    {examResult.breakdownByTopic.map((ts, idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-slate-900/60 border border-slate-700/60 flex items-center justify-between">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-sm text-gray-200">{ts.topicName}</p>
                          <p className="text-xs text-gray-400">
                            Правильно: {ts.correct} из {ts.total} вопросов
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          ts.scorePercent >= 80 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}>
                          {ts.scorePercent}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detailed Question Review */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold uppercase tracking-wider text-gray-400">
                  Детальный разбор всех вопросов и объяснения:
                </h4>
                <div className="space-y-3">
                  {examResult.gradedQuestions?.map((gq, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-xl border text-sm space-y-2.5 ${
                        gq.isCorrect
                          ? 'bg-emerald-950/15 border-emerald-500/30'
                          : 'bg-rose-950/20 border-rose-500/30'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <span className="font-bold text-xs text-fuchsia-400">
                          Вопрос {idx + 1} ({gq.topicName})
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          gq.isCorrect ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {gq.isCorrect ? 'Верно' : 'Ошибка'}
                        </span>
                      </div>

                      <p className={`text-base font-semibold ${textHeading}`}>{gq.question}</p>

                      <div className="space-y-1 text-xs sm:text-sm">
                        <p>
                          <span className="text-gray-400">Ваш ответ: </span>
                          <span className={gq.isCorrect ? 'text-emerald-400 font-bold' : 'text-rose-400 line-through font-bold'}>
                            {gq.userAnswer || '(нет ответа)'}
                          </span>
                        </p>
                        {!gq.isCorrect && (
                          <p>
                            <span className="text-gray-400">Правильный ответ: </span>
                            <span className="text-emerald-400 font-bold">{gq.correctAnswer}</span>
                          </p>
                        )}
                      </div>

                      {gq.explanation && (
                        <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-700/60 text-xs text-gray-300 leading-relaxed">
                          💡 <span className="font-semibold text-gray-200">Объяснение правила:</span> {gq.explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* ACTIVE EXAM QUESTION TAKER */
            <div className="space-y-5">
              
              {/* Question Pills Navigation */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold text-gray-400">
                  <span>Вопрос {currentIndex + 1} из {totalQ}</span>
                  <span>Отвечено: {answeredCount} / {totalQ}</span>
                </div>
                
                {/* Horizontal Question Pills */}
                <div className={`flex flex-wrap gap-1.5 p-2 rounded-xl border ${pillsContainerBg}`}>
                  {examData?.questions?.map((q, idx) => {
                    const userAns = (userAnswers[q.id] || '').trim();
                    const isAnswered = Boolean(userAns);
                    const isCurrent = idx === currentIndex;
                    const correct = isAnswered && isAnswerCorrect(userAns, q.correctAnswer, q.alternativeAnswers);

                    let pillClass = pillUnanswered;
                    if (isCurrent) {
                      pillClass = 'bg-fuchsia-500 text-white ring-2 ring-fuchsia-400 scale-110 shadow-md';
                    } else if (isAnswered) {
                      if (correct) {
                        pillClass = 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/40';
                      } else {
                        pillClass = 'bg-rose-500/30 text-rose-300 border border-rose-500/50 hover:bg-rose-500/40';
                      }
                    }

                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setCurrentIndex(idx)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition-all flex items-center justify-center ${pillClass}`}
                        title={`Вопрос ${idx + 1}: ${q.topicName} ${isAnswered ? (correct ? '(Верно)' : '(Ошибка)') : '(Не отвечено)'}`}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Question Card */}
              {currentQ && (
                <div className={`p-5 sm:p-6 rounded-2xl border ${cardBg} shadow-lg space-y-4`}>
                  <div className="flex items-center justify-between">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {currentQ.topicName}
                    </span>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleSpeak(currentQ.question)}
                        className={`p-1.5 rounded-lg transition-all ${isDark ? "bg-slate-800 text-gray-300 hover:text-white hover:bg-fuchsia-600" : "bg-slate-100 text-slate-700 hover:bg-fuchsia-600 hover:text-white"}`}
                        title="Озвучить вопрос"
                      >
                        <Volume2 className="h-4 w-4" />
                      </button>
                      <span className="text-xs font-medium text-gray-400">
                        {currentQ.type === 'multiple-choice' ? 'Выбор (1-4)' : 'Ввод ответа (Enter)'}
                      </span>
                    </div>
                  </div>

                  <p className={`text-lg sm:text-xl font-bold leading-snug whitespace-pre-line ${textHeading}`}>
                    {currentQ.question}
                  </p>

                  {/* Multiple Choice Options */}
                  {currentQ.type === 'multiple-choice' && (
                    <div className="grid grid-cols-1 gap-2.5 pt-2">
                      {currentQ.options?.map((opt, oIdx) => {
                        const isSelected = selectedOption === opt;
                        return (
                          <button
                            key={oIdx}
                            type="button"
                            onClick={() => handleSelectOption(opt)}
                            className={`w-full p-4 rounded-xl text-left font-medium text-sm sm:text-base border transition-all flex items-center justify-between active:scale-[0.99] ${
                              isSelected
                                ? 'bg-fuchsia-600/30 border-fuchsia-500 text-white shadow-md'
                                : optBgUnselected
                            }`}
                          >
                            <div className="flex items-center space-x-3">
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                isSelected ? 'bg-fuchsia-500 text-white' : 'bg-slate-800 text-gray-400'
                              }`}>
                                {oIdx + 1}
                              </span>
                              <span>{opt}</span>
                            </div>
                            {isSelected && <Check className="h-5 w-5 text-fuchsia-400" />}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Fill-in-the-blank Typing Input */}
                  {currentQ.type !== 'multiple-choice' && (
                    <div className="space-y-3 pt-2">
                      <input
                        type="text"
                        value={typedAnswer}
                        onChange={(e) => handleTypedChange(e.target.value)}
                        onKeyDown={handleInputKeyDown}
                        placeholder="Введите ответ на испанском и нажмите Enter..."
                        className={`w-full px-4 py-3.5 rounded-xl border text-base focus:outline-none focus:border-fuchsia-500 transition-all font-medium ${inputBg}`}
                      />
                      
                      {/* Special Spanish characters buttons */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] text-gray-500 mr-1">Быстрые символы:</span>
                        {SPANISH_SPECIAL_CHARS.map((char) => (
                          <button
                            key={char}
                            type="button"
                            onClick={() => insertSpecialChar(char)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono font-bold text-gray-200 transition-all active:scale-95"
                          >
                            {char}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}

            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className={`p-4 border-t ${borderCol} bg-slate-900/80 flex-shrink-0 flex items-center justify-between`}>
          {examResult ? (
            <div className="w-full flex items-center justify-between">
              <button
                onClick={startExam}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-gray-300 hover:text-white hover:bg-slate-800 transition-all"
              >
                <RotateCcw className="h-4 w-4 text-fuchsia-400" />
                <span>Пройти заново</span>
              </button>

              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold text-sm shadow-lg hover:from-fuchsia-600 hover:to-purple-700 transition-all"
              >
                Закрыть результаты
              </button>
            </div>
          ) : (
            <div className="w-full flex justify-between items-center">
              <button
                onClick={handlePrev}
                disabled={currentIndex === 0}
                className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Назад
              </button>

              <div className="flex items-center space-x-3">
                {isLastQuestion ? (
                  <button
                    onClick={handleSubmitExam}
                    disabled={submitting}
                    className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm shadow-lg hover:from-emerald-600 hover:to-teal-700 transition-all disabled:opacity-50"
                  >
                    {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    <span>Завершить экзамен</span>
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    className="flex items-center space-x-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white font-bold text-sm shadow-lg hover:from-purple-600 hover:to-fuchsia-700 transition-all"
                  >
                    <span>Далее</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
