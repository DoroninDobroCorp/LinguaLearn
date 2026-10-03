import React, { useState, useEffect } from 'react';
import {
  Sparkles, Lightbulb, Volume2, CheckCircle2, XCircle, RotateCcw,
  BookOpen, Eye, ArrowRight, Layers, Compass, HelpCircle, X, Check
} from 'lucide-react';
import { soundEngine, speakSpanish } from '../../utils/soundEffects';
import {
  DEMONSTRATIVE_ZONES,
  DEMONSTRATIVE_DRILL_QUESTIONS
} from '../../utils/demonstrativesPracticeData';
import { profileApiUrl, profileFetch } from '../../utils/api';

export default function DemonstrativesPracticeSection() {
  const [activeZoneFilter, setActiveZoneFilter] = useState('all'); // 'all', 'zone1_close', 'zone2_medium', 'zone3_far'
  const [activeCategory, setActiveCategory] = useState('all'); // 'all', 'forms', 'adverbs', 'neuter'
  const [showMnemonicModal, setShowMnemonicModal] = useState(false);
  const [showMatrix, setShowMatrix] = useState(true);

  // Drill State
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [stats, setStats] = useState({ correct: 0, total: 0, streak: 0 });

  const initQuestions = (category = activeCategory, zone = activeZoneFilter) => {
    let pool = [...DEMONSTRATIVE_DRILL_QUESTIONS];
    if (category !== 'all') {
      pool = pool.filter((q) => q.category === category);
    }
    if (zone !== 'all') {
      pool = pool.filter((q) => q.distance === zone);
    }
    if (pool.length === 0) {
      pool = [...DEMONSTRATIVE_DRILL_QUESTIONS];
    }
    const shuffled = pool.sort(() => 0.5 - Math.random());
    setQuestions(shuffled);
    setCurrentIndex(0);
    setSelectedOption(null);
    setShowResult(false);
    setIsCorrect(false);
  };

  useEffect(() => {
    initQuestions(activeCategory, activeZoneFilter);
  }, [activeCategory, activeZoneFilter]);

  const currentQ = questions[currentIndex] || null;

  const handleSelectOption = (opt) => {
    if (showResult || !currentQ) return;
    setSelectedOption(opt);
    soundEngine.playTileClick();

    const match = opt.toLowerCase().trim() === currentQ.correctAnswer.toLowerCase().trim();
    setIsCorrect(match);
    setShowResult(true);

    if (match) {
      soundEngine.playCorrect();
      setStats((prev) => ({
        correct: prev.correct + 1,
        total: prev.total + 1,
        streak: prev.streak + 1,
      }));
      if (currentQ.exampleAudio) {
        speakSpanish(currentQ.exampleAudio);
      }
      // Gamification award
      try {
        profileFetch(profileApiUrl('/spanish/api/gamification/action'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'demonstratives_practice', xp: 3 }),
        }).then(() => {
          window.dispatchEvent(new CustomEvent('gamification_updated'));
        }).catch(() => {});
      } catch {}
    } else {
      soundEngine.playError();
      setStats((prev) => ({
        correct: prev.correct,
        total: prev.total + 1,
        streak: 0,
      }));
    }
  };

  const handleNext = () => {
    soundEngine.playTileClick();
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setShowResult(false);
      setIsCorrect(false);
    } else {
      soundEngine.playLevelUp();
      initQuestions(activeCategory, activeZoneFilter);
    }
  };

  const handleRestart = () => {
    soundEngine.playTileClick();
    setStats({ correct: 0, total: 0, streak: 0 });
    initQuestions(activeCategory, activeZoneFilter);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* 1. Header Banner with Mnemonic Launcher */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-500 p-6 sm:p-8 text-white shadow-xl">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold mb-3">
            <Compass className="h-3.5 w-3.5" />
            <span>3 дистанции пространства • Все формы и наречия</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
            Указатели и дистанция: Este / Ese / Aquel
          </h2>
          <p className="mt-2 text-sm sm:text-base text-purple-100 leading-relaxed">
            Легко запомните 3 степени удалённости: <strong>este</strong> (тут у меня), <strong>ese</strong> (там у тебя), <strong>aquel</strong> (вон там далеко) + наречия <strong>acá, ahí, allá</strong>.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                soundEngine.playTileClick();
                setShowMnemonicModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-purple-900 font-extrabold text-sm shadow-lg hover:bg-purple-50 transition-all hover:scale-105 active:scale-95"
            >
              <Lightbulb className="h-4 w-4 text-amber-500 fill-amber-500" />
              <span>💡 Мнемоническая шпаргалка (комикс)</span>
            </button>
            <button
              onClick={() => setShowMatrix((v) => !v)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/20 backdrop-blur-md text-white font-bold text-sm hover:bg-white/30 transition-all"
            >
              <Layers className="h-4 w-4" />
              <span>{showMatrix ? 'Скрыть таблицу форм' : 'Показать все 15 форм'}</span>
            </button>
          </div>
        </div>

        {/* Decorative background circle */}
        <div className="absolute -right-12 -bottom-12 w-64 h-64 rounded-full bg-white/10 blur-2xl pointer-events-none" />
      </div>

      {/* 2. Interactive Matrix of All 15 Forms + Adverbs */}
      {showMatrix && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 sm:p-6 border border-purple-100 dark:border-gray-700 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700 pb-3">
            <div>
              <h3 className="font-extrabold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                <span>📍 3 зоны дистанции и полная таблица форм</span>
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Нажмите на форму, чтобы прослушать правильное произношение
              </p>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {[
                { id: 'all', label: 'Все зоны' },
                { id: 'zone1_close', label: '1. Este (близко)' },
                { id: 'zone2_medium', label: '2. Ese (рядом)' },
                { id: 'zone3_far', label: '3. Aquel (далеко)' },
              ].map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => {
                    soundEngine.playTileClick();
                    setActiveZoneFilter(filter.id);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    activeZoneFilter === filter.id
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {DEMONSTRATIVE_ZONES.filter((z) => activeZoneFilter === 'all' || z.id === activeZoneFilter).map((zone) => (
              <div
                key={zone.id}
                className={`rounded-2xl border p-4 sm:p-5 flex flex-col justify-between ${zone.bg} ${zone.border} transition-all hover:shadow-md`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-black text-sm tracking-wide text-gray-900 dark:text-white">
                      {zone.title}
                    </span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${zone.tagBg}`}>
                      {zone.subtitle.split('(')[0]}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 italic mb-3">
                    {zone.mnemonic}
                  </p>

                  {/* Adverbs */}
                  <div className="mb-3 p-2.5 rounded-xl bg-white/80 dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700 text-xs space-y-1">
                    <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px] block">
                      Наречия места:
                    </span>
                    {zone.adverbs.map((adv) => (
                      <div
                        key={adv.es}
                        onClick={() => speakSpanish(adv.es)}
                        className="flex items-center justify-between cursor-pointer hover:text-purple-600 group py-0.5"
                      >
                        <span className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                          <Volume2 className="h-3 w-3 text-purple-400 group-hover:scale-110" />
                          <strong>{adv.es}</strong>
                        </span>
                        <span className="text-gray-500 dark:text-gray-400 text-[11px]">{adv.ru}</span>
                      </div>
                    ))}
                  </div>

                  {/* Forms Table */}
                  <div className="space-y-1.5">
                    <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px] block">
                      Указательные формы:
                    </span>
                    {zone.forms.map((f) => (
                      <div
                        key={f.es}
                        onClick={() => speakSpanish(f.es)}
                        className="p-2 rounded-xl bg-white/90 dark:bg-gray-800/90 border border-gray-100 dark:border-gray-700/60 flex items-center justify-between text-xs cursor-pointer hover:border-purple-300 transition-all group"
                      >
                        <div className="flex items-center gap-2">
                          <Volume2 className="h-3.5 w-3.5 text-purple-400 group-hover:text-purple-600 transition-colors" />
                          <span className="font-extrabold text-sm text-gray-900 dark:text-white">
                            {f.es}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 font-mono">
                            {f.gender}
                          </span>
                        </div>
                        <span className="text-gray-600 dark:text-gray-300 font-medium text-xs">
                          {f.ru}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Category Filter for Practice */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar p-1 bg-white/70 dark:bg-gray-800/70 rounded-2xl border border-gray-200 dark:border-gray-700">
          {[
            { id: 'all', label: 'Все вопросы (25+)' },
            { id: 'forms', label: 'Формы (род и число)' },
            { id: 'adverbs', label: 'Наречия (acá / ahí / allá)' },
            { id: 'neuter', label: 'Нейтральные (esto/eso/aquello)' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                soundEngine.playTileClick();
                setActiveCategory(cat.id);
              }}
              className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
                activeCategory === cat.id
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Stats counter */}
        <div className="flex items-center gap-3 text-xs sm:text-sm font-bold bg-white dark:bg-gray-800 px-3.5 py-2 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <span className="text-emerald-600 dark:text-emerald-400">
            Верно: {stats.correct}/{stats.total}
          </span>
          {stats.streak > 1 && (
            <span className="text-amber-500 flex items-center gap-1">
              🔥 Серия: {stats.streak}
            </span>
          )}
          <button
            onClick={handleRestart}
            title="Начать заново"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 4. Active Exercise Card */}
      {currentQ ? (
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 sm:p-8 border border-purple-100 dark:border-gray-700 shadow-xl space-y-6">
          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold text-gray-500 dark:text-gray-400">
              <span>Вопрос {currentIndex + 1} из {questions.length}</span>
              <span className="text-purple-600 dark:text-purple-400 font-semibold">{currentQ.distanceHint}</span>
            </div>
            <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-500 transition-all duration-300"
                style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Sentence Display */}
          <div className="space-y-2 text-center py-4">
            <p className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white leading-relaxed">
              {currentQ.sentence.split('___').map((part, pIdx, arr) => (
                <React.Fragment key={pIdx}>
                  {part}
                  {pIdx < arr.length - 1 && (
                    <span className="inline-block mx-1.5 px-3 py-1 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-extrabold border-2 border-dashed border-purple-300 dark:border-purple-600">
                      {selectedOption || '____'}
                    </span>
                  )}
                </React.Fragment>
              ))}
            </p>
            <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 font-medium">
              {currentQ.translation}
            </p>
          </div>

          {/* Options Grid */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 max-w-lg mx-auto">
            {currentQ.options.map((opt) => {
              const isSelected = selectedOption === opt;
              const isRight = showResult && opt.toLowerCase().trim() === currentQ.correctAnswer.toLowerCase().trim();
              const isWrong = showResult && isSelected && !isRight;

              let btnStyle = 'bg-gray-50 dark:bg-gray-700/60 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-white hover:border-purple-300 hover:bg-purple-50/50';

              if (showResult) {
                if (isRight) {
                  btnStyle = 'bg-emerald-500 border-emerald-600 text-white shadow-md scale-102';
                } else if (isWrong) {
                  btnStyle = 'bg-rose-500 border-rose-600 text-white shadow-md animate-shake';
                } else {
                  btnStyle = 'opacity-40 bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400';
                }
              }

              return (
                <button
                  key={opt}
                  onClick={() => handleSelectOption(opt)}
                  disabled={showResult}
                  className={`p-4 rounded-2xl border-2 font-extrabold text-base sm:text-lg transition-all flex items-center justify-center gap-2 active:scale-95 ${btnStyle}`}
                >
                  <span>{opt}</span>
                  {showResult && isRight && <Check className="h-5 w-5" />}
                  {showResult && isWrong && <X className="h-5 w-5" />}
                </button>
              );
            })}
          </div>

          {/* Result / Explanation Box */}
          {showResult && (
            <div className={`rounded-2xl p-4 sm:p-5 border transition-all animate-fadeIn ${
              isCorrect
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100'
                : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-100'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  {isCorrect ? (
                    <CheckCircle2 className="h-6 w-6 text-emerald-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-6 w-6 text-rose-500 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className="font-extrabold text-sm sm:text-base">
                      {isCorrect ? '¡Excelente! Правильно! 🎉' : `Не совсем. Правильный ответ: ${currentQ.correctAnswer}`}
                    </p>
                    <p className="text-xs sm:text-sm leading-relaxed opacity-95">
                      {currentQ.explanation}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {currentQ.exampleAudio && (
                    <button
                      onClick={() => speakSpanish(currentQ.exampleAudio)}
                      className="p-2.5 rounded-xl bg-white dark:bg-gray-800 text-purple-600 dark:text-purple-300 hover:bg-purple-50 transition-colors shadow-sm"
                      title="Озвучить предложение"
                    >
                      <Volume2 className="h-5 w-5" />
                    </button>
                  )}
                  <button
                    onClick={handleNext}
                    className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-sm shadow-md transition-all flex items-center gap-1.5 active:scale-95"
                  >
                    <span>{currentIndex < questions.length - 1 ? 'Дальше' : 'Завершить раунд'}</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-10 text-center border border-gray-100 dark:border-gray-700">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Все вопросы пройдены!</h3>
          <p className="text-sm text-gray-500 mt-1">Отличная работа по закреплению всех 3 дистанций!</p>
          <button
            onClick={handleRestart}
            className="mt-4 px-6 py-2.5 rounded-xl bg-purple-600 text-white font-bold text-sm shadow hover:bg-purple-700 transition-all"
          >
            Пройти раунд ещё раз 🔄
          </button>
        </div>
      )}

      {/* 5. Mnemonic Cheatsheet Modal */}
      {showMnemonicModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-4xl w-full max-h-[92vh] overflow-y-auto border border-purple-200 dark:border-gray-700 shadow-2xl relative">
            <button
              onClick={() => setShowMnemonicModal(false)}
              className="absolute top-4 right-4 z-20 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="p-5 sm:p-7 space-y-5">
              <div className="text-center max-w-xl mx-auto">
                <span className="px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-extrabold text-xs">
                  Шпаргалка-мнемоника
                </span>
                <h3 className="text-2xl font-black text-gray-900 dark:text-white mt-1.5">
                  Как мгновенно запомнить Este, Ese и Aquel
                </h3>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Используйте яркие ассоциации из комикса для безошибочного выбора:
                </p>
              </div>

              {/* Comic Image */}
              <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-lg bg-gray-50 dark:bg-gray-800">
                <img
                  src={`${import.meta.env.BASE_URL}demonstratives-mnemonic.jpg`}
                  alt="Мнемоника Este - Acá, Ese - Ahí, Aquel - Allá"
                  className="w-full h-auto object-contain max-h-[60vh] mx-auto"
                />
              </div>

              {/* 3 Key Takeaways */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                  <div className="font-black text-sm text-emerald-900 dark:text-emerald-200 mb-1">
                    1. ESTE — ACÁ (Тут / Здесь)
                  </div>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300 italic mb-2">
                    «Этот ЭСТЭт любит свой АКа! ❤️»
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                    Предмет в руках или рядом с говорящим. Буква <strong>T</strong> в es<strong>t</strong>e напоминает слово «<strong>Т</strong>ут».
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                  <div className="font-black text-sm text-amber-900 dark:text-amber-200 mb-1">
                    2. ESE — AHÍ (Там у тебя / Рядом)
                  </div>
                  <p className="text-xs text-amber-800 dark:text-amber-300 italic mb-2">
                    «То ЭСЭ написано АИ!»
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                    Предмет на среднем расстоянии или прямо около собеседника. Нет буквы T: es<strong>e</strong>.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800">
                  <div className="font-black text-sm text-indigo-900 dark:text-indigo-200 mb-1">
                    3. AQUEL — ALLÁ (Вон там далеко)
                  </div>
                  <p className="text-xs text-indigo-800 dark:text-indigo-300 italic mb-2">
                    «Акела АЖ таАм!»
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                    Предмет далеко от обоих говорящих (на горизонте, на холме). В Аргентине <em>allá</em> звучит как «аша».
                  </p>
                </div>
              </div>

              <div className="text-center pt-2">
                <button
                  onClick={() => setShowMnemonicModal(false)}
                  className="px-6 py-2.5 rounded-xl bg-purple-600 text-white font-extrabold text-sm shadow hover:bg-purple-700 transition-all"
                >
                  Понятно, вернуться к тренировке 🚀
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
