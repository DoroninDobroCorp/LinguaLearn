import React, { useState, useEffect } from 'react';
import { 
  Sparkles, ArrowRight, Lightbulb, Volume2, CheckCircle2, XCircle, RotateCcw, 
  HelpCircle, AlertTriangle, BookOpen, Layers, Zap
} from 'lucide-react';
import { soundEngine, speakSpanish } from '../../utils/soundEffects';
import { 
  SUFFIX_RULES, 
  FALSE_FRIENDS_GUIDE, 
  COGNATE_DRILL_QUESTIONS 
} from '../../utils/cognateBridgesData';

export default function CognateBridgesSection() {
  const [activeCategory, setActiveCategory] = useState('all'); // 'all', 'suffixes', 'false_friends'
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const [cheatSheetTab, setCheatSheetTab] = useState('rules'); // 'rules', 'false_friends'
  const [stats, setStats] = useState({ correct: 0, total: 0, streak: 0 });

  // Shuffle and load questions based on category
  const initQuestions = (category = activeCategory) => {
    let pool = [...COGNATE_DRILL_QUESTIONS];
    if (category !== 'all') {
      pool = pool.filter(q => q.category === category);
    }
    const shuffled = pool.sort(() => 0.5 - Math.random());
    setQuestions(shuffled);
    setCurrentIndex(0);
    setSelectedOption(null);
    setShowResult(false);
    setIsCorrect(false);
  };

  useEffect(() => {
    initQuestions(activeCategory);
  }, [activeCategory]);

  const currentQ = questions[currentIndex] || null;

  const handleSelectOption = (opt) => {
    if (showResult || !currentQ) return;
    setSelectedOption(opt);
    soundEngine.playTileClick();

    const match = opt === currentQ.correctAnswer || (currentQ.acceptableAnswers && currentQ.acceptableAnswers.includes(opt.toLowerCase().trim()));
    setIsCorrect(match);
    setShowResult(true);

    if (match) {
      soundEngine.playCorrect();
      setStats(prev => ({ correct: prev.correct + 1, total: prev.total + 1, streak: prev.streak + 1 }));
      if (currentQ.exampleSentence) {
        const esText = currentQ.exampleSentence.split('(')[0].trim();
        speakSpanish(esText);
      }
    } else {
      soundEngine.playWrong();
      setStats(prev => ({ ...prev, total: prev.total + 1, streak: 0 }));
    }
  };

  const handleNext = () => {
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setShowResult(false);
      setIsCorrect(false);
    } else {
      // Re-shuffle on finish
      initQuestions(activeCategory);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Bar */}
      <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-800 dark:via-gray-800 dark:to-indigo-950/30 border-2 border-indigo-200 dark:border-gray-700 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-600 text-white font-black text-sm">
                🌉 Когнаты & Ложные друзья
              </span>
              <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                Тема 31 (A1 Accelerator)
              </span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Супер-ускоритель словарного запаса: мгновенный перевод 3000+ английских слов по суффиксам и ловушки «ложных друзей».
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCheatSheet(!showCheatSheet)}
              className="px-4 py-2 rounded-xl border border-indigo-300 dark:border-gray-600 bg-white dark:bg-gray-750 text-indigo-700 dark:text-indigo-300 font-bold text-xs hover:bg-indigo-50 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <span>{showCheatSheet ? 'Скрыть шпаргалку ▲' : '💡 Шпаргалка правил и ловушек ▼'}</span>
            </button>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-indigo-100 dark:border-gray-700">
          {[
            { id: 'all', label: '🌟 Все темы (Микс)', desc: 'Суффиксы + Ложные друзья' },
            { id: 'suffixes', label: '🌉 Суффиксальные мосты', desc: '-ción, -dad, -oso, -ico, -mente' },
            { id: 'false_friends', label: '🚨 Ложные друзья (Исключения)', desc: 'embarazada, éxito, actualmente...' },
          ].map((cat) => {
            const isSelected = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  soundEngine.playTileClick();
                  setActiveCategory(cat.id);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-md scale-105'
                    : 'bg-white dark:bg-gray-750 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-indigo-50'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cheat Sheet & False Friends Tables Modal / Panel */}
      {showCheatSheet && (
        <div className="p-6 rounded-3xl bg-amber-50/90 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700 shadow-xl space-y-4 animate-fadeIn">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-amber-200 dark:border-amber-800 pb-3">
            <div className="flex items-center gap-2 font-black text-sm text-amber-950 dark:text-amber-200">
              <BookOpen className="w-5 h-5 text-amber-600" />
              <span>Шпаргалка: Правила трансформации и Ложные друзья</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setCheatSheetTab('rules')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  cheatSheetTab === 'rules'
                    ? 'bg-amber-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-amber-900 dark:text-amber-200 border border-amber-300'
                }`}
              >
                🌉 Суффиксальные мосты
              </button>
              <button
                onClick={() => setCheatSheetTab('false_friends')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  cheatSheetTab === 'false_friends'
                    ? 'bg-rose-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-rose-900 dark:text-rose-200 border border-rose-300'
                }`}
              >
                🚨 Ложные друзья (Топ-20)
              </button>
            </div>
          </div>

          {cheatSheetTab === 'rules' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {SUFFIX_RULES.map((rule, idx) => (
                <div key={idx} className="p-3.5 rounded-2xl bg-white/90 dark:bg-gray-800/90 border border-amber-200 dark:border-amber-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-xs text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/50">
                      {rule.pattern}
                    </span>
                    <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
                      {rule.gender}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-gray-300">
                    {rule.description}
                  </p>
                  <div className="border-t border-gray-100 dark:border-gray-700 pt-1.5 space-y-1 text-[11px]">
                    {rule.examples.slice(0, 3).map((ex, exIdx) => (
                      <div key={exIdx} className="flex items-center justify-between text-gray-700 dark:text-gray-200 font-medium">
                        <span className="text-gray-400">{ex.en} ➔</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">{ex.es}</span>
                        <span className="text-gray-500 text-[10px]">({ex.ru})</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto pr-1">
              {FALSE_FRIENDS_GUIDE.map((ff, idx) => (
                <div key={idx} className="p-3 rounded-2xl bg-white/90 dark:bg-gray-800/90 border border-rose-200 dark:border-rose-900/50 space-y-1 text-xs">
                  <div className="flex items-center justify-between font-black">
                    <span className="text-rose-600 dark:text-rose-400 text-sm">{ff.spanish}</span>
                    <span className="text-[11px] text-gray-400 line-through font-normal">{ff.looksLikeEn}</span>
                  </div>
                  <div className="font-bold text-emerald-700 dark:text-emerald-400">
                    ✅ На самом деле: {ff.realMeaningRu}
                  </div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400">
                    💡 {ff.howToSayTheFakeMeaning}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Interactive Exercise Card */}
      {currentQ ? (
        <div className="max-w-2xl mx-auto p-6 sm:p-8 rounded-3xl bg-white dark:bg-gray-800 border-2 border-indigo-100 dark:border-gray-700 shadow-2xl space-y-6">
          {/* Progress & Badge */}
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 rounded-full text-xs font-black bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              {currentQ.pattern}
            </span>

            <div className="flex items-center gap-3 text-xs font-bold text-gray-500 dark:text-gray-400">
              {stats.streak > 1 && (
                <span className="text-amber-500 font-extrabold flex items-center gap-0.5">
                  🔥 {stats.streak} подряд
                </span>
              )}
              <span>Вопрос {currentIndex + 1} из {questions.length}</span>
            </div>
          </div>

          {/* Prompt */}
          <div className="text-center space-y-2">
            <h3 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white">
              {currentQ.prompt}
            </h3>
            {currentQ.englishClue && (
              <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                💡 Подсказка-ключ: {currentQ.englishClue}
              </p>
            )}
          </div>

          {/* Option Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {currentQ.options.map((opt, oIdx) => {
              const isSelected = selectedOption === opt;
              const isCorrectOpt = opt === currentQ.correctAnswer;
              
              let btnClass = 'p-4 rounded-2xl border-2 text-left font-bold text-xs sm:text-sm transition-all cursor-pointer ';
              if (!showResult) {
                btnClass += 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 text-gray-800 dark:text-gray-200 hover:border-indigo-400 hover:bg-indigo-50/50';
              } else if (isCorrectOpt) {
                btnClass += 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 shadow-md font-extrabold scale-102';
              } else if (isSelected && !isCorrectOpt) {
                btnClass += 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 shadow-sm line-through opacity-75';
              } else {
                btnClass += 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-400 opacity-50';
              }

              return (
                <button
                  key={oIdx}
                  onClick={() => handleSelectOption(opt)}
                  disabled={showResult}
                  className={btnClass}
                >
                  <div className="flex items-center justify-between">
                    <span>{opt}</span>
                    {showResult && isCorrectOpt && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                    {showResult && isSelected && !isCorrectOpt && <XCircle className="w-5 h-5 text-rose-500" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Result & Detailed Explanation Feedback */}
          {showResult && (
            <div className={`p-4 sm:p-5 rounded-2xl border-2 space-y-3 animate-fadeIn ${
              isCorrect
                ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100'
                : 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-100'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-black text-sm">
                  {isCorrect ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <span>Отлично! Абсолютно верно</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-rose-600" />
                      <span>Внимание: правильный ответ — {currentQ.correctAnswer}</span>
                    </>
                  )}
                </div>

                {currentQ.exampleSentence && (
                  <button
                    onClick={() => {
                      const esText = currentQ.exampleSentence.split('(')[0].trim();
                      speakSpanish(esText);
                    }}
                    className="p-1.5 rounded-lg bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-200 hover:text-indigo-600 cursor-pointer"
                    title="Озвучить пример"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <p className="text-xs font-medium opacity-90 leading-relaxed">
                {currentQ.explanation}
              </p>

              {currentQ.exampleSentence && (
                <div className="p-2.5 rounded-xl bg-white/80 dark:bg-gray-800/80 text-xs font-semibold text-gray-800 dark:text-gray-200 flex items-center justify-between gap-2 border border-black/5">
                  <span>📖 {currentQ.exampleSentence}</span>
                </div>
              )}

              <button
                onClick={handleNext}
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{currentIndex + 1 < questions.length ? 'Следующий вопрос' : 'Пройти снова 🔄'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
