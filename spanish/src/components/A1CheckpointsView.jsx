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

  // For productive writing in checkpoint
  const [writingText, setWritingText] = useState('');

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
    setWritingText('');
  };

  const handleSelectOption = (task, opt) => {
    if (isSubmitted) return;
    const isCorrect = opt === task.correctAnswer;
    if (isCorrect) soundEngine.playCorrect();
    else soundEngine.playWrong();
    setAnswers(prev => ({
      ...prev,
      [task.id]: {
        topicId: task.topicId,
        taskId: task.id,
        selected: opt,
        correct: isCorrect,
        quality: isCorrect ? 5 : 1,
        eventId: globalThis.crypto?.randomUUID?.() || `chk-${task.id}-${Date.now()}`
      }
    }));
  };

  const handleSubmitCheckpoint = async () => {
    if (!activeCheckpoint || submitting) return;
    try {
      setSubmitting(true);
      const answersList = Object.values(answers);

      // Productive writing is practice here; only server-validated objective answers affect this checkpoint.

      const res = await profileFetch(profileApiUrl(`/spanish/api/a1/checkpoints/${activeCheckpoint.unitId}/submit`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: answersList })
      });

      if (res.ok) {
        const data = await res.json();
        setSubmissionResult(data);
        setIsSubmitted(true);
        window.dispatchEvent(new CustomEvent('gamification_updated'));
      }
    } catch (err) {
      console.error('Error submitting checkpoint:', err);
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
    const tasks = activeCheckpoint.tasks || [];
    const currentTask = tasks[currentTaskIndex];
    const answeredCount = Object.keys(answers).length;
    const progressPct = Math.round((answeredCount / Math.max(1, tasks.length)) * 100);

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
            onClick={() => setActiveCheckpoint(null)}
            className="text-xs text-gray-500 hover:text-gray-700 font-bold px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700"
          >
            Выйти
          </button>
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

            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white leading-relaxed">
              {currentTask.question || currentTask.prompt}
            </h3>

            {/* Options */}
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

            {/* Productive Writing Input */}
            {currentTask.type === 'productive_writing' && (
              <div className="space-y-3">
                <textarea
                  value={writingText}
                  onChange={(e) => setWritingText(e.target.value)}
                  placeholder="Напишите ваш текст на испанском языке..."
                  rows={5}
                  className="w-full p-4 rounded-2xl border border-purple-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-purple-500"
                />
                <div className="text-xs text-gray-500 font-medium">
                  Слов: {writingText.trim() ? writingText.trim().split(/\s+/).filter(Boolean).length : 0} (минимум {currentTask.minWords || 15})
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
                onClick={() => setCurrentTaskIndex(prev => Math.max(0, prev - 1))}
                disabled={currentTaskIndex === 0}
                className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-400 disabled:opacity-30"
              >
                Назад
              </button>

              {currentTaskIndex < tasks.length - 1 ? (
                <button
                  onClick={() => setCurrentTaskIndex(prev => prev + 1)}
                  className="px-5 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold rounded-xl text-xs sm:text-sm shadow flex items-center gap-1.5 hover:shadow-md transition-transform active:scale-95"
                >
                  <span>Следующее задание</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleSubmitCheckpoint}
                  disabled={submitting || isSubmitted}
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl text-xs sm:text-sm shadow-lg flex items-center gap-1.5 hover:shadow-xl transition-transform active:scale-95"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Завершить контрольную точку</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Results summary modal when submitted */}
        {isSubmitted && submissionResult && (
          <div className="p-6 rounded-3xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center space-y-3">
            <Trophy className="w-12 h-12 text-amber-500 mx-auto" />
            <h4 className="text-xl font-extrabold text-gray-900 dark:text-white">
              {submissionResult.passed ? 'Контрольная точка пройдена' : 'Контрольную точку стоит повторить'}
            </h4>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Результат: <strong>{submissionResult.objectiveScore}%</strong>. Сервер проверил {submissionResult.recordedAttempts} ответов и передал их адаптивной системе повторений.
              {submissionResult.productiveEvaluationRequired && ' Письменная часть здесь тренировочная; зачёт по письму сдаётся отдельно в разделе «4 навыка».'}
            </p>
            <button
              onClick={() => setActiveCheckpoint(null)}
              className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white font-bold rounded-xl text-sm shadow hover:shadow-md"
            >
              Вернуться к списку
            </button>
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
                  <span className="text-xs font-semibold drop-shadow">
                    {chk.tasks?.length || chk.tasksCount || 15} заданий
                  </span>
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
                    Адаптивный зачёт
                  </span>

                  <button
                    onClick={() => handleStartCheckpoint(chk)}
                    className="px-4 py-2 bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-bold rounded-xl text-xs sm:text-sm shadow flex items-center gap-1.5 active:scale-95 transition-transform"
                  >
                    <span>Начать срез</span>
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
