import React, { useState } from 'react';
import { Target, Lightbulb, Play, CheckCircle2, XCircle } from 'lucide-react';
import { profileApiUrl, profileFetch } from '../../utils/api';
import { soundEngine } from '../../utils/soundEffects';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  createVerbDrillQuestion,
  DRILL_PRONOUN_MODES,
  DRILL_TYPES,
  getVerbDrillDisplayAnswer,
  getVerbDrillProgressTopic,
  isVerbDrillAnswerCorrect,
  isVerbDrillFinished,
} from '../../utils/verbDrills';

export default function VerbDrillsSection({ onTopicUpdated }) {
  const { t } = useLanguage();
  const [drillType, setDrillType] = useState('fourKeyVerbs');
  const [pronounMode, setPronounMode] = useState('all');
  const [runMode, setRunMode] = useState('ten');
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [stats, setStats] = useState({ correct: 0, incorrect: 0, completed: 0 });
  const [showRuleHint, setShowRuleHint] = useState(false);

  const SPANISH_CHARS = ['á', 'é', 'í', 'ó', 'ú', 'ñ', '¿', '¡'];

  const startSession = () => {
    setStats({ correct: 0, incorrect: 0, completed: 0 });
    setCurrentQuestion(createVerbDrillQuestion(drillType, pronounMode));
    setAnswer('');
    setShowResult(false);
    setIsCorrect(false);
    setShowRuleHint(false);
    setSessionActive(true);
    soundEngine.playLevelUp();
  };

  const checkDrillAnswer = async () => {
    if (!currentQuestion || showResult || !answer.trim()) return;

    const correct = isVerbDrillAnswerCorrect(answer, currentQuestion);
    const nextStats = {
      correct: stats.correct + (correct ? 1 : 0),
      incorrect: stats.incorrect + (correct ? 0 : 1),
      completed: stats.completed + 1,
    };

    setStats(nextStats);
    setIsCorrect(correct);
    setShowResult(true);

    if (correct) soundEngine.playCorrect();
    else soundEngine.playWrong();

    // Record / Resolve mistake in student grammar mistake memory
    try {
      if (!correct) {
        profileFetch(profileApiUrl('/spanish/api/exercises/record-mistake'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicName: getVerbDrillProgressTopic(currentQuestion),
            category: 'verb_conjugation',
            level: DRILL_TYPES[drillType]?.level || 'A1',
            prompt: `${currentQuestion.pronoun?.label || ''} + ${currentQuestion.verb?.infinitive || ''} (${DRILL_TYPES[drillType]?.title || ''})`,
            userWrongAnswer: answer.trim(),
            correctAnswer: getVerbDrillDisplayAnswer(currentQuestion),
            ruleExplanation: currentRules[0] || 'Правило спряжения глагола'
          })
        }).catch(() => {});
      } else {
        profileFetch(profileApiUrl('/spanish/api/exercises/resolve-mistake'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: 'verb_conjugation',
            prompt: `${currentQuestion.pronoun?.label || ''} + ${currentQuestion.verb?.infinitive || ''} (${DRILL_TYPES[drillType]?.title || ''})`
          })
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('Mistake tracking error in VerbDrills:', e);
    }

    try {
      await profileFetch(profileApiUrl('/spanish/api/topics/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: getVerbDrillProgressTopic(currentQuestion),
          category: 'Practice',
          level: DRILL_TYPES[drillType]?.level || 'A1',
          success: correct,
          eventId: globalThis.crypto?.randomUUID?.() || 'verb-' + Date.now() + '-' + stats.completed,
          activityType: 'verb_drill',
        }),
      });
      if (typeof onTopicUpdated === 'function') onTopicUpdated();
    } catch (error) {
      console.error('Error updating verb drill topic:', error);
    }
  };

  const nextQuestion = () => {
    if (isVerbDrillFinished(stats, runMode)) {
      setSessionActive(false);
      soundEngine.playLevelUp();
      return;
    }
    setCurrentQuestion(createVerbDrillQuestion(drillType, pronounMode));
    setAnswer('');
    setShowResult(false);
    setIsCorrect(false);
  };

  const insertChar = (c) => setAnswer(prev => prev + c);

  const currentRules = DRILL_TYPES[drillType]?.rules || [];

  return (
    <div className="max-w-3xl mx-auto glass-card rounded-3xl p-6 sm:p-10 shadow-2xl border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 animate-fadeIn">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-purple-100 dark:border-gray-700 pb-4 mb-6">
        <div>
          <h3 className="text-xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
            <Target className="w-6 h-6 text-fuchsia-500" />
            <span>Тренировка спряжения глаголов</span>
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Отрабатывай 4 главных глагола (ser, estar, tener, ir) и правильные окончания с аргентинским voseo.
          </p>
        </div>

        {sessionActive && (
          <button
            onClick={() => setShowRuleHint(!showRuleHint)}
            className="px-3.5 py-1.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 font-bold text-xs hover:bg-amber-100 transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Lightbulb className="w-4 h-4 text-amber-600" />
            <span>{showRuleHint ? 'Скрыть подсказку ▲' : '💡 Подсказка правила ▼'}</span>
          </button>
        )}
      </div>

      {/* Rule Hint Modal */}
      {showRuleHint && currentRules.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/90 dark:bg-amber-950/50 border-2 border-amber-300 dark:border-amber-700 shadow-md mb-6 animate-fadeIn space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-black text-sm text-amber-950 dark:text-amber-200">
              <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <span>Правило и шпаргалка спряжений: {DRILL_TYPES[drillType]?.label}</span>
            </div>
            <button
              onClick={() => setShowRuleHint(false)}
              className="text-xs text-amber-700 hover:text-amber-900 font-bold"
            >
              ✕ Закрыть
            </button>
          </div>

          <div className="space-y-2 text-xs sm:text-sm font-medium text-amber-950 dark:text-amber-100">
            {currentRules.map((rule, rIdx) => (
              <div key={rIdx} className="p-2.5 rounded-xl bg-white/80 dark:bg-gray-800/80 border border-amber-200 dark:border-amber-800">
                {rule}
              </div>
            ))}
          </div>
        </div>
      )}

      {!sessionActive ? (
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                Тип глаголов:
              </label>
              <button
                onClick={() => setShowRuleHint(!showRuleHint)}
                className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span>{showRuleHint ? 'Скрыть шпаргалку' : 'Посмотреть шпаргалку правил'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {Object.entries(DRILL_TYPES).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => {
                    soundEngine.playTileClick();
                    setDrillType(k);
                  }}
                  className={`p-3.5 rounded-2xl border-2 text-left transition-all ${
                    drillType === k
                      ? 'bg-purple-100 dark:bg-purple-900/60 border-purple-500 text-purple-900 dark:text-purple-200 shadow-md font-bold'
                      : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-purple-300 bg-white dark:bg-gray-800'
                  }`}
                >
                  <div className="font-extrabold text-sm">{v.label}</div>
                  {v.rules && v.rules.length > 0 && (
                    <div className="text-[11px] opacity-75 mt-0.5 line-clamp-1">{v.rules[0]}</div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              Местоимения:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(DRILL_PRONOUN_MODES).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => {
                    soundEngine.playTileClick();
                    setPronounMode(k);
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                    pronounMode === k
                      ? 'bg-fuchsia-500 text-white border-fuchsia-500 shadow'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={startSession}
            className="w-full py-4 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-black text-base sm:text-lg rounded-2xl shadow-xl hover:from-fuchsia-600 hover:to-purple-700 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Play className="w-5 h-5" />
            <span>Начать тренировку спряжений</span>
          </button>
        </div>
      ) : (
        <div>
          {currentQuestion && (
            <div className="space-y-6 animate-fadeIn">
              <div className="p-6 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/40 dark:to-pink-950/40 border border-purple-200 dark:border-gray-700 text-center relative">
                <div className="text-xs font-bold uppercase text-purple-600 dark:text-purple-400 mb-1">
                  Глагол: {currentQuestion.verb} ({currentQuestion.translation})
                </div>
                <div className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white my-2">
                  {currentQuestion.prompt || `${currentQuestion.pronoun} _______`}
                </div>
                {currentQuestion.instruction && (
                  <div className="text-xs text-gray-500 italic mt-1">{currentQuestion.instruction}</div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    disabled={showResult}
                    placeholder="Введи форму глагола..."
                    className="flex-1 px-4 py-3.5 border-2 border-purple-200 dark:border-gray-600 dark:bg-gray-800 rounded-xl font-bold text-base text-gray-900 dark:text-white focus:border-purple-500 focus:outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && (showResult ? nextQuestion() : checkDrillAnswer())}
                  />
                  {!showResult ? (
                    <button
                      onClick={checkDrillAnswer}
                      disabled={!answer.trim()}
                      className="px-6 py-3.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold rounded-xl shadow-md disabled:opacity-50"
                    >
                      Проверить
                    </button>
                  ) : (
                    <button
                      onClick={nextQuestion}
                      className="px-6 py-3.5 bg-green-600 text-white font-bold rounded-xl shadow-md flex items-center gap-1.5"
                    >
                      <span>Далее ➔</span>
                    </button>
                  )}
                </div>

                {!showResult && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] font-bold text-gray-500 mr-1">Быстрый ввод:</span>
                    {SPANISH_CHARS.map((char) => (
                      <button
                        key={char}
                        type="button"
                        onClick={() => insertChar(char)}
                        className="px-2 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-black text-gray-800 dark:text-gray-200 hover:bg-purple-100 dark:hover:bg-purple-900 transition-colors shadow-sm"
                      >
                        {char}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {showResult && (
                <div className="space-y-3 animate-fadeIn">
                  <div className={`p-4 rounded-2xl font-bold text-sm border-2 ${
                    isCorrect
                      ? 'bg-green-50 dark:bg-green-950/40 border-green-500 text-green-900 dark:text-green-200'
                      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-500 text-rose-900 dark:text-rose-200'
                  }`}>
                    <div className="text-base font-black flex items-center gap-2">
                      {isCorrect ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-rose-600" />}
                      <span>{isCorrect ? '¡Excelente! Форма верна.' : `Неверно. Правильная форма: ${getVerbDrillDisplayAnswer(currentQuestion)}`}</span>
                    </div>

                    {currentQuestion.reason && (
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mt-2 pl-7">
                        💡 {currentQuestion.reason}
                      </p>
                    )}
                  </div>

                  <div className="p-3.5 rounded-xl bg-purple-50/70 dark:bg-gray-750 border border-purple-200 dark:border-gray-700 text-xs text-purple-950 dark:text-purple-200 flex items-start gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-bold">Шпаргалка: </strong>
                      <span>{currentRules[0] || 'Обратите внимание на спряжение для данного местоимения.'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
