import React, { useState, useEffect } from 'react';
import {
  Trophy, ShieldCheck, CheckCircle2, XCircle, HelpCircle,
  Play, Award, ArrowRight, RotateCcw, Loader2, Sparkles, Check, AlertCircle, Image as ImageIcon
} from 'lucide-react';
import { profileApiUrl, profileFetch, getAssetUrl } from '../utils/api';
import { soundEngine } from '../utils/soundEffects';
import { useLanguage } from '../contexts/LanguageContext';

export default function A1CheckpointsView() {
  const { t, language } = useLanguage();
  const [checkpoints, setCheckpoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCheckpoint, setActiveCheckpoint] = useState(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Drafts for text questions and productive writing
  const [textDrafts, setTextDrafts] = useState({});
  const [writingDrafts, setWritingDrafts] = useState({});
  const [submitError, setSubmitError] = useState('');

  const taskNeedsText = (task) => Boolean(task) && ['gap', 'input', 'transformation'].includes(task.type) && !task.options;

  const isTaskAnswered = (task) => {
    if (!task) return false;
    if (answers[task.id]) return true;
    if (taskNeedsText(task) && String(textDrafts[task.id] || '').trim().length > 0) return true;
    if (task.type === 'productive_writing' && String(writingDrafts[task.id] || '').trim().length > 0) return true;
    return false;
  };

  const evaluateTextAnswer = (task, text) => {
    const fold = (val) => String(val || '').toLowerCase().replace(/[¿?¡!.,;:«»"'“”]/g, '').replace(/\s+/g, ' ').trim();
    const accepted = [task.correctAnswer, ...(task.acceptableAnswers || [])].map(fold);
    const given = fold(text);
    const isCorrect = accepted.includes(given);
    return {
      topicId: task.topicId || 27,
      taskId: task.id,
      text: String(text || '').trim(),
      correct: isCorrect,
      quality: isCorrect ? 5 : 1,
      eventId: globalThis.crypto?.randomUUID?.() || `chk-${task.id}-${Date.now()}`
    };
  };

  const fetchCheckpoints = async () => {
    try {
      setLoading(true);
      const res = await profileFetch(profileApiUrl('/spanish/api/a1/checkpoints'));
      if (res.ok) {
        const data = await res.json();
        setCheckpoints(data.checkpoints || []);
      }
    } catch (err) {
      console.error('Error fetching checkpoints:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCheckpoints();
  }, []);

  const handleStartCheckpoint = (chk) => {
    setActiveCheckpoint(chk);
    setCurrentTaskIndex(0);
    setAnswers({});
    setIsSubmitted(false);
    setSubmissionResult(null);
    setTextDrafts({});
    setWritingDrafts({});
    setSubmitError('');
  };

  // Safe task list extraction (supporting both flat tasks and sections for final checkpoint)
  const tasks = activeCheckpoint?.tasks?.length
    ? activeCheckpoint.tasks
    : (activeCheckpoint?.sections || []).flatMap((sec) => {
        if (Array.isArray(sec.tasks)) {
          return sec.tasks.map((t) => ({
            ...t,
            type: t.type || 'choice',
            skill: sec.skill,
            topicId: t.topicId || 27,
            context: sec.text || t.context || null,
          }));
        }
        if (sec.task) {
          return [{
            ...sec.task,
            type: sec.skill === 'writing' ? 'productive_writing' : (sec.skill === 'speaking' ? 'productive_speaking' : (sec.task.type || 'choice')),
            skill: sec.skill,
            topicId: sec.task.topicId || 27,
            context: sec.text || sec.task.context || null,
          }];
        }
        return [];
      });

  const commitCurrentTask = (targetTask = tasks[currentTaskIndex]) => {
    if (!targetTask) return;
    if (taskNeedsText(targetTask) && !answers[targetTask.id]) {
      const text = String(textDrafts[targetTask.id] || '').trim();
      if (text) {
        const evaluated = evaluateTextAnswer(targetTask, text);
        setAnswers((prev) => ({ ...prev, [targetTask.id]: evaluated }));
      }
    } else if (targetTask.type === 'productive_writing' && !answers[targetTask.id]) {
      const text = String(writingDrafts[targetTask.id] || '').trim();
      if (text) {
        setAnswers((prev) => ({
          ...prev,
          [targetTask.id]: {
            topicId: targetTask.topicId || 27,
            taskId: targetTask.id,
            text,
            correct: true,
            quality: 4,
            eventId: globalThis.crypto?.randomUUID?.() || `chk-${targetTask.id}-${Date.now()}`
          }
        }));
      }
    }
  };

  const handleNext = () => {
    commitCurrentTask();
    setSubmitError('');
    setCurrentTaskIndex((prev) => Math.min(tasks.length - 1, prev + 1));
  };

  const handlePrev = () => {
    commitCurrentTask();
    setSubmitError('');
    setCurrentTaskIndex((prev) => Math.max(0, prev - 1));
  };

  const goToTask = (idx) => {
    commitCurrentTask();
    setSubmitError('');
    setCurrentTaskIndex(idx);
  };

  const handleTextAnswer = (task) => {
    if (isSubmitted || answers[task.id]) return;
    const text = String(textDrafts[task.id] || '').trim();
    if (!text) return;
    const evaluated = evaluateTextAnswer(task, text);
    if (evaluated.correct) soundEngine.playCorrect();
    else soundEngine.playWrong();
    setAnswers((prev) => ({ ...prev, [task.id]: evaluated }));
  };

  const handleSelectOption = (task, opt) => {
    if (isSubmitted) return;
    const isCorrect = opt === task.correctAnswer;
    if (isCorrect) soundEngine.playCorrect();
    else soundEngine.playWrong();
    setAnswers((prev) => ({
      ...prev,
      [task.id]: {
        topicId: task.topicId || 27,
        taskId: task.id,
        selected: opt,
        correct: isCorrect,
        quality: isCorrect ? 5 : 1,
        eventId: globalThis.crypto?.randomUUID?.() || `chk-${task.id}-${Date.now()}`
      }
    }));
  };

  const handleSubmitCheckpoint = async () => {
    if (!activeCheckpoint || submitting || isSubmitted) return;
    setSubmitError('');

    // Gather all answers, auto-committing any entered drafts across all tasks
    const currentAnswers = { ...answers };
    for (const task of tasks) {
      if (taskNeedsText(task) && !currentAnswers[task.id]) {
        const text = String(textDrafts[task.id] || '').trim();
        if (text) {
          currentAnswers[task.id] = evaluateTextAnswer(task, text);
        }
      } else if (task.type === 'productive_writing' && !currentAnswers[task.id]) {
        const text = String(writingDrafts[task.id] || '').trim();
        if (text) {
          currentAnswers[task.id] = {
            topicId: task.topicId || 27,
            taskId: task.id,
            text,
            correct: true,
            quality: 4,
            eventId: globalThis.crypto?.randomUUID?.() || `chk-${task.id}-${Date.now()}`
          };
        }
      }
    }
    setAnswers(currentAnswers);

    // Check if any required objective task is missing
    const missingIndex = tasks.findIndex((t) =>
      t.topicId && (Array.isArray(t.options) || taskNeedsText(t)) && !currentAnswers[t.id]
    );

    if (missingIndex !== -1) {
      setCurrentTaskIndex(missingIndex);
      setSubmitError(`Пожалуйста, ответьте на задание №${missingIndex + 1}: ${tasks[missingIndex].question || tasks[missingIndex].prompt || 'Введите ответ'}`);
      return;
    }

    try {
      setSubmitting(true);
      const answersList = Object.values(currentAnswers);

      const res = await profileFetch(profileApiUrl(`/spanish/api/a1/checkpoints/${activeCheckpoint.unitId}/submit`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: answersList })
      });

      if (res.ok) {
        const data = await res.json();
        setSubmissionResult(data);
        setIsSubmitted(true);
        soundEngine.playLevelUp();
        window.dispatchEvent(new CustomEvent('gamification_updated'));
      } else {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.error || 'Не удалось сохранить контрольную точку.');
      }
    } catch (err) {
      console.error('Error submitting checkpoint:', err);
      setSubmitError('Не удалось сохранить контрольную точку.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-purple-600">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="ml-3 font-semibold text-sm">Загрузка контрольных точек A1...</span>
      </div>
    );
  }

  // Active Checkpoint Runner View
  if (activeCheckpoint) {
    const currentTask = tasks[currentTaskIndex];
    const answeredCount = tasks.filter(isTaskAnswered).length;
    const progressPct = Math.round((answeredCount / Math.max(1, tasks.length)) * 100);

    // If already submitted and result available, show the dedicated Results Screen
    if (isSubmitted && submissionResult) {
      return (
        <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6 animate-fadeIn">
          {/* Top Header */}
          <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-2xl border border-purple-100 dark:border-gray-700 shadow-sm">
            <div>
              <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
                {activeCheckpoint.title}
              </h2>
              <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Контрольный срез завершён</span>
              </div>
            </div>

            <button
              onClick={() => {
                setActiveCheckpoint(null);
                fetchCheckpoints();
              }}
              className="text-xs text-gray-600 hover:text-gray-900 dark:text-gray-300 font-bold px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700"
            >
              К списку срезов
            </button>
          </div>

          {/* Results Summary Card */}
          <div className="glass-card rounded-3xl p-6 sm:p-8 border border-purple-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl space-y-6 text-center animate-fadeIn">
            <div className="inline-flex p-4 rounded-full bg-gradient-to-tr from-amber-400 to-fuchsia-600 text-white shadow-lg mx-auto">
              <Trophy className="w-12 h-12" />
            </div>

            <div>
              <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                submissionResult.passed
                  ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                  : 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300'
              }`}>
                {submissionResult.passed ? 'Срез успешно сдан' : 'Срез завершён'}
              </span>
              <h3 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mt-2">
                {submissionResult.passed ? '🎉 Поздравляем! Контрольная точка пройдена' : 'Контрольную точку стоит повторить'}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 max-w-lg mx-auto mt-1">
                {submissionResult.passed
                  ? 'Все ответы успешно проверены и зафиксированы в вашей адаптивной системе повторений.'
                  : 'Ответы зафиксированы. Рекомендуем повторить темы, в которых были допущены ошибки.'}
              </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-lg mx-auto pt-2">
              <div className="p-4 rounded-2xl bg-purple-50 dark:bg-gray-750 border border-purple-100 dark:border-gray-700">
                <div className="text-xs text-gray-500 font-semibold uppercase">Результат</div>
                <div className={`text-2xl sm:text-3xl font-black mt-1 ${submissionResult.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {submissionResult.objectiveScore}%
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-purple-50 dark:bg-gray-750 border border-purple-100 dark:border-gray-700">
                <div className="text-xs text-gray-500 font-semibold uppercase">Проверено</div>
                <div className="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400 mt-1">
                  {submissionResult.recordedAttempts} заданий
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-purple-50 dark:bg-gray-750 border border-purple-100 dark:border-gray-700 col-span-2 sm:col-span-1">
                <div className="text-xs text-gray-500 font-semibold uppercase">Адаптивный зачёт</div>
                <div className="text-sm font-bold text-gray-800 dark:text-gray-200 mt-2 flex items-center justify-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  Сохранено в БД
                </div>
              </div>
            </div>

            {submissionResult.productiveEvaluationRequired && (
              <div className="p-4 rounded-2xl bg-fuchsia-50 dark:bg-gray-750 border border-fuchsia-200 dark:border-gray-700 text-xs sm:text-sm text-fuchsia-900 dark:text-fuchsia-200 text-left max-w-lg mx-auto space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-fuchsia-600" />
                  Письменное задание зафиксировано
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Ваш текст сохранён и передан в портфолио речевых навыков A1.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={() => {
                  setActiveCheckpoint(null);
                  fetchCheckpoints();
                }}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 text-white font-bold rounded-xl text-sm shadow-md transition-transform active:scale-95"
              >
                Вернуться к списку срезов
              </button>
              <button
                onClick={() => handleStartCheckpoint(activeCheckpoint)}
                className="w-full sm:w-auto px-5 py-3 border border-purple-200 dark:border-gray-700 hover:bg-purple-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold rounded-xl text-sm flex items-center justify-center gap-1.5 transition-transform active:scale-95"
              >
                <RotateCcw className="w-4 h-4" />
                Пройти снова
              </button>
            </div>

            {/* Answers Review List */}
            <div className="pt-6 border-t border-purple-100 dark:border-gray-700 text-left space-y-3">
              <h4 className="text-sm font-bold uppercase tracking-wider text-gray-500">
                Разбор заданий среза:
              </h4>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {tasks.map((task, idx) => {
                  const ans = answers[task.id];
                  const isCorrect = ans?.correct;
                  const studentAnswer = ans?.selected || ans?.text || '(пропущено)';
                  return (
                    <div
                      key={task.id || idx}
                      className={`p-3.5 rounded-2xl border text-xs sm:text-sm space-y-1 ${
                        isCorrect
                          ? 'bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800/50'
                          : 'bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-800/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-gray-900 dark:text-white">
                          <span className="text-purple-600 font-bold mr-1.5">{idx + 1}.</span>
                          {task.question || task.prompt}
                        </div>
                        {isCorrect ? (
                          <span className="flex items-center gap-1 text-green-700 dark:text-green-400 font-bold flex-shrink-0 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Верно
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-bold flex-shrink-0 text-xs">
                            <XCircle className="w-3.5 h-3.5" />
                            Ошибка
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        Твой ответ: <strong className="text-gray-900 dark:text-gray-200">{studentAnswer}</strong>
                        {!isCorrect && task.correctAnswer && (
                          <span className="ml-2 text-emerald-700 dark:text-emerald-400 font-semibold">
                            (Правильно: {task.correctAnswer})
                          </span>
                        )}
                      </div>
                      {task.explanation && (
                        <div className="text-[11px] text-gray-500 italic mt-0.5">
                          💡 {task.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6 animate-fadeIn">
        {/* Top Header */}
        <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-2xl border border-purple-100 dark:border-gray-700 shadow-sm">
          <div>
            <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
              {activeCheckpoint.title}
            </h2>
            <div className="text-xs text-purple-600 dark:text-purple-400 font-semibold">
              Задание {currentTaskIndex + 1} из {tasks.length} • Отвечено: {answeredCount}/{tasks.length}
            </div>
          </div>

          <button
            onClick={() => {
              commitCurrentTask();
              setActiveCheckpoint(null);
            }}
            className="text-xs text-gray-500 hover:text-gray-700 font-bold px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700"
          >
            Выйти
          </button>
        </div>

        {/* Task Pills Quick Navigation */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {tasks.map((t, idx) => {
            const isCurrent = idx === currentTaskIndex;
            const isDone = isTaskAnswered(t);
            return (
              <button
                key={t.id || idx}
                type="button"
                onClick={() => goToTask(idx)}
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl text-xs font-bold flex-shrink-0 flex items-center justify-center transition-all ${
                  isCurrent
                    ? 'bg-purple-600 text-white shadow-md ring-2 ring-purple-400 ring-offset-1 dark:ring-offset-gray-800'
                    : isDone
                    ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                    : 'bg-gray-100 dark:bg-gray-750 text-gray-500 hover:border-purple-300 border border-gray-200 dark:border-gray-700'
                }`}
                title={`Задание ${idx + 1}`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 h-2.5 rounded-full overflow-hidden">
          <div
            className="bg-gradient-to-r from-fuchsia-500 to-purple-600 h-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Task Card */}
        {currentTask && (
          <div className="glass-card rounded-3xl p-6 sm:p-8 border border-purple-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl space-y-6">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-xs font-bold uppercase">
                {currentTask.type}
              </span>
              <span className="text-xs text-gray-500 font-medium">
                {currentTask.topicId ? `Тема ID ${currentTask.topicId}` : ''}
              </span>
            </div>

            {/* Reading context if provided */}
            {currentTask.context && (
              <div className="p-4 rounded-2xl bg-purple-50 dark:bg-gray-750 border border-purple-200 dark:border-gray-700 text-xs sm:text-sm text-gray-800 dark:text-gray-200 leading-relaxed max-h-48 overflow-y-auto">
                <div className="font-bold text-xs text-purple-700 dark:text-purple-300 uppercase tracking-wider mb-1">
                  📖 Текст для чтения:
                </div>
                {currentTask.context}
              </div>
            )}

            {/* Audio player if provided */}
            {currentTask.audioUrl && (
              <div className="p-3 bg-purple-50 dark:bg-gray-750 rounded-2xl border border-purple-200 dark:border-gray-700">
                <audio controls className="w-full h-8" src={getAssetUrl(currentTask.audioUrl)} />
              </div>
            )}

            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white leading-relaxed">
              {currentTask.question || currentTask.prompt}
            </h3>

            {/* Options for Choice / Scenario */}
            {currentTask.options && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {currentTask.options.map((opt, optIdx) => {
                  const isSelected = answers[currentTask.id]?.selected === opt;
                  const isAnswered = Boolean(answers[currentTask.id]);
                  const isCorrect = opt === currentTask.correctAnswer;

                  let btnCls = 'bg-gray-50 dark:bg-gray-750 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:border-purple-400';
                  if (isAnswered) {
                    if (isCorrect) btnCls = 'bg-green-100 dark:bg-green-900/60 border-green-500 text-green-900 dark:text-green-200 font-bold';
                    else if (isSelected) btnCls = 'bg-red-100 dark:bg-red-900/60 border-red-500 text-red-900 dark:text-red-200';
                    else btnCls = 'opacity-40';
                  }

                  return (
                    <button
                      key={optIdx}
                      type="button"
                      onClick={() => handleSelectOption(currentTask, opt)}
                      disabled={isAnswered}
                      className={`p-4 text-left rounded-2xl border text-xs sm:text-sm font-semibold transition-all shadow-sm ${btnCls}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Gap / Input / Transformation */}
            {taskNeedsText(currentTask) && (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleTextAnswer(currentTask);
                }}
              >
                <label className="sr-only" htmlFor={`checkpoint-answer-${currentTask.id}`}>Твой ответ</label>
                <input
                  id={`checkpoint-answer-${currentTask.id}`}
                  type="text"
                  value={answers[currentTask.id]?.text ?? textDrafts[currentTask.id] ?? ''}
                  onChange={(event) => setTextDrafts((prev) => ({ ...prev, [currentTask.id]: event.target.value }))}
                  placeholder="Введите ответ на испанском..."
                  disabled={Boolean(answers[currentTask.id])}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full p-4 rounded-2xl border border-purple-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-purple-500"
                />
                {!answers[currentTask.id] && (
                  <button
                    type="submit"
                    disabled={!String(textDrafts[currentTask.id] || '').trim()}
                    className="px-5 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold rounded-xl text-xs sm:text-sm shadow disabled:opacity-50"
                  >
                    Проверить
                  </button>
                )}
                {answers[currentTask.id] && (
                  <div className={`p-3.5 rounded-xl text-xs sm:text-sm font-bold ${
                    answers[currentTask.id].correct
                      ? 'bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-200'
                      : 'bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200'
                  }`}>
                    {answers[currentTask.id].correct ? 'Верно.' : `Правильный ответ: ${currentTask.correctAnswer}`}
                  </div>
                )}
              </form>
            )}

            {currentTask.type === 'productive_speaking' && (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Это устное задание. Зачёт по говорению сдаётся в разделе «4 навыка». Здесь его можно пропустить.
              </p>
            )}

            {/* Productive Writing Input */}
            {currentTask.type === 'productive_writing' && (
              <div className="space-y-3">
                <textarea
                  value={writingDrafts[currentTask.id] ?? ''}
                  onChange={(e) => setWritingDrafts((prev) => ({ ...prev, [currentTask.id]: e.target.value }))}
                  placeholder="Напишите ваш текст на испанском языке..."
                  rows={5}
                  className="w-full p-4 rounded-2xl border border-purple-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-purple-500"
                />
                <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
                  <span>
                    Слов: {String(writingDrafts[currentTask.id] || '').trim() ? String(writingDrafts[currentTask.id]).trim().split(/\s+/).filter(Boolean).length : 0} (минимум {currentTask.minWords || 15})
                  </span>
                  {String(writingDrafts[currentTask.id] || '').trim().split(/\s+/).filter(Boolean).length >= (currentTask.minWords || 15) && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      Объём текста достаточен
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Explanation if answered */}
            {answers[currentTask.id] && currentTask.explanation && (
              <div className="p-3.5 rounded-xl bg-purple-50 dark:bg-gray-750 border border-purple-100 dark:border-gray-700 text-xs sm:text-sm text-purple-900 dark:text-purple-200">
                💡 {currentTask.explanation}
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-purple-100 dark:border-gray-700">
              <button
                type="button"
                onClick={handlePrev}
                disabled={currentTaskIndex === 0}
                className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-400 disabled:opacity-30 hover:text-gray-900 dark:hover:text-white"
              >
                Назад
              </button>

              {currentTaskIndex < tasks.length - 1 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-5 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-bold rounded-xl text-xs sm:text-sm shadow flex items-center gap-1.5 hover:shadow-md transition-transform active:scale-95"
                >
                  <span>Следующее задание</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmitCheckpoint}
                  disabled={submitting}
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold rounded-xl text-xs sm:text-sm shadow-lg flex items-center gap-1.5 hover:shadow-xl transition-transform active:scale-95 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Сохранение...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Завершить контрольную точку</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {submitError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{submitError}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Checkpoints Directory List
  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex items-center gap-3">
          <Trophy className="w-8 h-8 text-amber-300 flex-shrink-0" />
          <div>
            <h2 className="text-xl sm:text-2xl font-black">
              Контрольные точки и выпускной экзамен A1
            </h2>
            <p className="text-xs sm:text-sm text-purple-100 mt-1">
              9 модульных срезов знаний (12–18 заданий: 40% текущий модуль, 40% отложенное повторение, 20% реальное общение) и финальный выпускной экзамен.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {checkpoints.map((chk, idx) => {
          const isFinal = chk.id === 'checkpoint-a1-final';
          const unitNum = chk.unitOrder || idx + 1;
          const coverFilename = !isFinal
            ? `a1-u${String(unitNum).padStart(2, '0')}-cover-01.webp`
            : 'a1-u09-cover-01.webp';
          const coverUrl = getAssetUrl(`/a1/media/${coverFilename}`);
          const isCompleted = chk.status?.completed;
          const score = chk.status?.score ?? null;
          const isPassed = chk.status?.passed;

          return (
            <div
              key={chk.id || idx}
              className={`rounded-3xl overflow-hidden border transition-all shadow-md flex flex-col justify-between ${
                isFinal
                  ? 'bg-gradient-to-br from-amber-500/10 via-purple-500/10 to-fuchsia-500/10 border-amber-300 dark:border-amber-700 md:col-span-2'
                  : 'bg-white dark:bg-gray-800 border-purple-100 dark:border-gray-700 hover:border-purple-300'
              }`}
            >
              {/* Unit Cover Image */}
              <div className="h-32 w-full bg-purple-100 dark:bg-gray-700 relative overflow-hidden">
                <img
                  src={coverUrl}
                  alt={chk.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-white">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/30 backdrop-blur-md">
                    {isFinal ? 'Выпускной экзамен' : `Модуль ${unitNum}`}
                  </span>
                  <div className="flex items-center gap-2">
                    {isCompleted && (
                      <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full shadow-sm ${
                        isPassed
                          ? 'bg-emerald-500 text-white'
                          : 'bg-amber-500 text-white'
                      }`}>
                        ✓ {score}%
                      </span>
                    )}
                    <span className="text-xs font-semibold drop-shadow">
                      {chk.tasks?.length || chk.tasksCount || 15} заданий
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                <div>
                  <h3 className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
                    {chk.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {chk.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                    <ShieldCheck className="w-4 h-4" />
                    {isCompleted ? (isPassed ? 'Зачёт получен' : 'Требуется закрепление') : 'Адаптивный зачёт'}
                  </span>

                  <button
                    onClick={() => handleStartCheckpoint(chk)}
                    className="px-4 py-2 bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-bold rounded-xl text-xs sm:text-sm shadow flex items-center gap-1.5 active:scale-95 transition-transform"
                  >
                    <span>{isCompleted ? 'Повторить срез' : 'Начать срез'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
