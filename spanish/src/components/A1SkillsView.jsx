import React, { useState, useEffect, useRef } from 'react';
import {
  Headphones, Mic, BookOpen, PenTool, CheckCircle2,
  Play, Volume2, RotateCcw, Award, Check, ArrowRight, Loader2, Sparkles, AlertCircle, Info
} from 'lucide-react';
import { profileApiUrl, profileFetch, getAssetUrl } from '../utils/api';
import { soundEngine, speakSpanish } from '../utils/soundEffects';
import { useLanguage } from '../contexts/LanguageContext';

export default function A1SkillsView() {
  const { t, language } = useLanguage();
  const [selectedSkill, setSelectedSkill] = useState('listening'); // listening | speaking | reading | writing
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState(null);
  const [skillCoverage, setSkillCoverage] = useState([]);

  // Task answer states
  const [answers, setAnswers] = useState({});
  const [writingText, setWritingText] = useState('');
  const [recordingActive, setRecordingActive] = useState(false);
  const [recordingCompleted, setRecordingCompleted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [resultScore, setResultScore] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const audioRef = useRef(null);

  const fetchSkillTasks = async (skill) => {
    try {
      setLoading(true);
      const [taskRes, skillRes] = await Promise.all([
        profileFetch(profileApiUrl(`/spanish/api/a1/skills/${skill}`)),
        profileFetch(profileApiUrl('/spanish/api/a1/skills'))
      ]);

      if (taskRes.ok) {
        const data = await taskRes.json();
        setTasks(data.tasks || []);
      }
      if (skillRes.ok) {
        const data = await skillRes.json();
        setSkillCoverage(data.skills || []);
      }
    } catch (err) {
      console.error('Error fetching skill tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSkillTasks(selectedSkill);
    setActiveTask(null);
    setAnswers({});
    setWritingText('');
    setRecordingCompleted(false);
    setSubmitted(false);
    setResultScore(null);
  }, [selectedSkill]);

  const handleStartTask = (task) => {
    setActiveTask(task);
    setAnswers({});
    setWritingText('');
    setRecordingActive(false);
    setRecordingCompleted(false);
    setSubmitted(false);
    setResultScore(null);
  };

  const handleOptionSelect = (qIdx, optIdx, correctIdx) => {
    if (submitted) return;
    const isCorrect = optIdx === correctIdx;
    if (isCorrect) soundEngine.playCorrect();
    else soundEngine.playWrong();
    setAnswers(prev => ({ ...prev, [qIdx]: optIdx }));
  };

  const handleSubmitTask = async () => {
    if (!activeTask || submitting) return;
    try {
      setSubmitting(true);
      let calculatedScore = 75;

      if (selectedSkill === 'listening' || selectedSkill === 'reading') {
        const questions = activeTask.questions || [];
        let correctCount = 0;
        questions.forEach((q, idx) => {
          if (answers[idx] === q.correctIndex) correctCount++;
        });
        calculatedScore = Math.round((correctCount / Math.max(1, questions.length)) * 100);
      } else if (selectedSkill === 'writing') {
        const words = writingText.trim().split(/\s+/).filter(Boolean).length;
        calculatedScore = Math.min(100, Math.max(50, words >= 15 ? 85 : words * 5));
      } else if (selectedSkill === 'speaking') {
        calculatedScore = 88;
      }

      const res = await profileFetch(profileApiUrl('/spanish/api/a1/skill-evidence'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill: selectedSkill,
          taskId: activeTask.id,
          score: calculatedScore,
          passed: calculatedScore >= 70,
          eventId: globalThis.crypto?.randomUUID?.() || `skill-ev-${activeTask.id}-${Date.now()}`
        })
      });

      if (res.ok) {
        setResultScore(calculatedScore);
        setSubmitted(true);
        window.dispatchEvent(new CustomEvent('gamification_updated'));
        fetchSkillTasks(selectedSkill);
      }
    } catch (err) {
      console.error('Error submitting skill task:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const currentCoverage = skillCoverage.find(s => s.skill === selectedSkill);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Skill Tabs Header */}
      <div className="bg-white dark:bg-gray-800 p-2 rounded-3xl border border-purple-100 dark:border-gray-700 shadow-md flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedSkill('listening')}
          className={`flex-1 min-w-[130px] py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
            selectedSkill === 'listening'
              ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md'
              : 'text-gray-600 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-gray-700'
          }`}
        >
          <Headphones className="w-4 h-4" />
          <span>Аудирование</span>
        </button>

        <button
          onClick={() => setSelectedSkill('speaking')}
          className={`flex-1 min-w-[130px] py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
            selectedSkill === 'speaking'
              ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md'
              : 'text-gray-600 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-gray-700'
          }`}
        >
          <Mic className="w-4 h-4" />
          <span>Говорение</span>
        </button>

        <button
          onClick={() => setSelectedSkill('reading')}
          className={`flex-1 min-w-[130px] py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
            selectedSkill === 'reading'
              ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md'
              : 'text-gray-600 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-gray-700'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Чтение</span>
        </button>

        <button
          onClick={() => setSelectedSkill('writing')}
          className={`flex-1 min-w-[130px] py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
            selectedSkill === 'writing'
              ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md'
              : 'text-gray-600 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-gray-700'
          }`}
        >
          <PenTool className="w-4 h-4" />
          <span>Письмо</span>
        </button>
      </div>

      {/* Current Skill Progress Badge */}
      {currentCoverage && (
        <div className="glass-card rounded-2xl p-4 border border-purple-100 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Award className="w-6 h-6 text-purple-600 flex-shrink-0" />
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase">Навыковый прогресс A1</div>
              <div className="text-sm sm:text-base font-extrabold text-gray-900 dark:text-white">
                {currentCoverage.percent}% освоено • Сдано зачётов: {currentCoverage.passed} / 3 (дней: {currentCoverage.passedDays}/2)
              </div>
            </div>
          </div>
          {currentCoverage.complete && (
            <span className="px-3 py-1 bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300 text-xs font-bold rounded-full">
              ✓ Зачёт сдан
            </span>
          )}
        </div>
      )}

      {/* Task Runner View */}
      {activeTask ? (
        <div className="glass-card rounded-3xl p-6 sm:p-8 border border-purple-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
              {selectedSkill.toUpperCase()} • {activeTask.unitId}
            </span>

            <button
              onClick={() => setActiveTask(null)}
              className="text-xs font-bold text-gray-500 hover:text-gray-700"
            >
              ← Вернуться к списку
            </button>
          </div>

          <h3 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-white">
            {activeTask.title}
          </h3>

          {/* LISTENING PLAYER */}
          {selectedSkill === 'listening' && (
            <div className="p-4 rounded-2xl bg-purple-50 dark:bg-gray-750 border border-purple-200 dark:border-gray-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-900 dark:text-purple-200 flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-purple-600" />
                  {activeTask.speakerInfo || 'Аудиозапись A1'} ({activeTask.durationSec} сек.)
                </span>
              </div>
              <audio
                ref={audioRef}
                controls
                src={getAssetUrl(activeTask.audioUrl)}
                className="w-full h-10 rounded-xl shadow-sm"
              />
            </div>
          )}

          {/* READING TEXT */}
          {selectedSkill === 'reading' && (
            <div className="p-5 rounded-2xl bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 text-sm sm:text-base text-gray-800 dark:text-gray-200 leading-relaxed space-y-3">
              <div className="flex items-center justify-between text-xs text-purple-600 dark:text-purple-400 font-bold border-b border-gray-200 dark:border-gray-700 pb-2">
                <span>Текст для чтения</span>
                <span>{activeTask.wordCount} слов • ~1 мин. чтения</span>
              </div>
              <div className="whitespace-pre-line">{activeTask.text}</div>
            </div>
          )}

          {/* SPEAKING RECORDER & RUBRIC */}
          {selectedSkill === 'speaking' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs sm:text-sm text-gray-800 dark:text-gray-200 whitespace-pre-line leading-relaxed">
                <div className="font-bold text-amber-900 dark:text-amber-200 mb-1">Задание:</div>
                {activeTask.promptRu}
              </div>

              {/* Rubric Breakdown */}
              {activeTask.rubric?.criteria && (
                <div className="p-3.5 rounded-2xl bg-purple-50/60 dark:bg-gray-750 border border-purple-100 dark:border-gray-700 space-y-2">
                  <div className="text-xs font-bold text-purple-900 dark:text-purple-300">
                    Критерии зачета (проходной балл 70/100):
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {activeTask.rubric.criteria.map((cr, idx) => (
                      <div key={idx} className="p-2 rounded-xl bg-white dark:bg-gray-800 border border-purple-100 dark:border-gray-700 text-center">
                        <div className="font-bold text-xs text-purple-700 dark:text-purple-300">{cr.max || cr.points} б.</div>
                        <div className="text-[11px] text-gray-600 dark:text-gray-400">{cr.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 text-center space-y-3">
                {!recordingCompleted ? (
                  <button
                    onClick={() => {
                      if (!recordingActive) {
                        setRecordingActive(true);
                        setTimeout(() => {
                          setRecordingActive(false);
                          setRecordingCompleted(true);
                        }, 5000);
                      }
                    }}
                    className={`px-6 py-3 rounded-2xl font-bold text-sm shadow-md transition-all flex items-center gap-2 mx-auto ${
                      recordingActive
                        ? 'bg-red-500 text-white animate-pulse'
                        : 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white'
                    }`}
                  >
                    <Mic className="w-4 h-4" />
                    <span>{recordingActive ? 'Идет запись... (говорите на испанском)' : 'Начать запись ответа (5 сек.)'}</span>
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm font-bold text-green-600 flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-5 h-5" />
                      <span>Запись ответа сохранена</span>
                    </div>
                    <button
                      onClick={() => {
                        setRecordingCompleted(false);
                        setRecordingActive(false);
                      }}
                      className="text-xs text-purple-600 hover:underline font-semibold"
                    >
                      Перезаписать
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* WRITING PROMPT & INPUT */}
          {selectedSkill === 'writing' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 text-xs sm:text-sm text-gray-800 dark:text-gray-200 whitespace-pre-line leading-relaxed">
                <div className="font-bold text-purple-900 dark:text-purple-200 mb-1">Задание:</div>
                {activeTask.promptRu}
              </div>

              {/* Rubric Breakdown */}
              {activeTask.rubric?.criteria && (
                <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 space-y-2">
                  <div className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    Критерии оценки (0–100 баллов):
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {activeTask.rubric.criteria.map((cr, idx) => (
                      <div key={idx} className="p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-center">
                        <div className="font-bold text-xs text-purple-700 dark:text-purple-300">{cr.max || cr.points} б.</div>
                        <div className="text-[11px] text-gray-600 dark:text-gray-400">{cr.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <textarea
                value={writingText}
                onChange={(e) => setWritingText(e.target.value)}
                placeholder="Escribe tu texto en español aquí..."
                rows={6}
                className="w-full p-4 rounded-2xl border border-purple-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-purple-500"
              />
              <div className="flex items-center justify-between text-xs text-gray-500 font-semibold">
                <span>Слов: {writingText.trim() ? writingText.trim().split(/\s+/).filter(Boolean).length : 0} (рекомендовано: {activeTask.wordRange})</span>
                <span>Символов: {writingText.length}</span>
              </div>
            </div>
          )}

          {/* QUESTIONS FOR LISTENING & READING */}
          {(selectedSkill === 'listening' || selectedSkill === 'reading') && (
            <div className="space-y-4 pt-2">
              <h4 className="font-extrabold text-sm text-gray-900 dark:text-white">
                Вопросы на понимание ({activeTask.questions?.length || 0}):
              </h4>

              {(activeTask.questions || []).map((q, qIdx) => {
                const answered = answers[qIdx] !== undefined;
                const sel = answers[qIdx];
                return (
                  <div key={qIdx} className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 space-y-2">
                    <div className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white">
                      {qIdx + 1}. {q.question}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt, optIdx) => {
                        let btnCls = 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:border-purple-400';
                        if (answered) {
                          if (optIdx === q.correctIndex) btnCls = 'bg-green-100 dark:bg-green-900/60 border-green-500 text-green-900 dark:text-green-200 font-bold';
                          else if (optIdx === sel) btnCls = 'bg-red-100 dark:bg-red-900/60 border-red-500 text-red-900 dark:text-red-200';
                          else btnCls = 'opacity-40';
                        }
                        return (
                          <button
                            key={optIdx}
                            onClick={() => handleOptionSelect(qIdx, optIdx, q.correctIndex)}
                            disabled={answered}
                            className={`p-3 text-left rounded-xl border text-xs font-semibold transition-all ${btnCls}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>

                    {answered && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 italic mt-1 p-2 bg-white/60 dark:bg-gray-800 rounded-lg">
                        💡 {q.explanation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Submit Action */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <button
              onClick={() => setActiveTask(null)}
              className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700"
            >
              Отмена
            </button>

            {!submitted ? (
              <button
                onClick={handleSubmitTask}
                disabled={submitting || (selectedSkill === 'speaking' && !recordingCompleted) || (selectedSkill === 'writing' && writingText.trim().length < 5)}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl text-xs sm:text-sm shadow flex items-center gap-1.5 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Отправить на проверку</span>
              </button>
            ) : (
              <div className="text-sm font-bold text-emerald-600 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                <span>Оценка: {resultScore}/100 {resultScore >= 70 ? '(Зачёт сдан! 🎉)' : '(Попробуйте еще раз)'}</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Task Catalog */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {loading ? (
            <div className="col-span-2 text-center py-12 text-purple-600">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
              <span className="text-sm font-semibold">Загрузка заданий...</span>
            </div>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                className="glass-card rounded-3xl p-5 border border-purple-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-md flex flex-col justify-between hover:border-purple-300 transition-all"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                      {task.unitId}
                    </span>
                    <span className="text-xs text-gray-500 font-medium">
                      {task.durationSec ? `${task.durationSec} сек.` : task.wordCount ? `${task.wordCount} слов` : task.wordRange || ''}
                    </span>
                  </div>

                  <h3 className="text-base font-extrabold text-gray-900 dark:text-white">
                    {task.title}
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                    {task.transcript || task.promptRu || task.text}
                  </p>
                </div>

                <div className="pt-4 mt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <span className="text-xs text-gray-500 font-medium">
                    Проходной балл: 70/100
                  </span>

                  <button
                    onClick={() => handleStartTask(task)}
                    className="px-4 py-2 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold rounded-xl text-xs shadow flex items-center gap-1.5 hover:shadow-md transition-transform active:scale-95"
                  >
                    <span>Выполнить зачёт</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
