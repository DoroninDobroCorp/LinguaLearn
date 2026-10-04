import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Volume2, Play, CheckCircle2, XCircle, RotateCcw,
  Film, Lightbulb, BookOpen, X, ArrowRight, Search,
  Trophy, Flame, Sparkles, Hash, Layers, Check
} from 'lucide-react';
import { soundEngine, speakSpanish } from '../../utils/soundEffects';
import { scoreTypedAnswer } from '../../utils/answerMatching';
import { profileApiUrl, profileFetch } from '../../utils/api';
import {
  MNEMONIC_CARTOONS,
  NUMBER_PRESETS,
  ROUND_NUMBERS_10_TO_1000,
  numberToSpanish,
  getSpanishNumberPhonetics,
  getSpanishNumberExplanation,
  generateNumberQuestion
} from '../../utils/spanishNumbersData';

export default function NumbersPracticeSection() {
  // Practice configuration
  const [activePreset, setActivePreset] = useState('round'); // 'round', 'cartoons', 'range_1_20', 'range_21_99', 'range_100_999', 'range_1_1000'
  const [drillMode, setDrillMode] = useState('number_to_word'); // 'number_to_word', 'word_to_number', 'audio_to_number', 'explorer'
  const [inputStyle, setInputStyle] = useState('choice'); // 'choice' | 'typed'

  // Question State
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [matchScore, setMatchScore] = useState(null);

  // Stats State
  const [stats, setStats] = useState({
    correct: 0,
    total: 0,
    streak: 0,
  });

  // Mnemonic Cartoon Modal State
  const [activeCartoon, setActiveCartoon] = useState(null); // '50' | '500' | null

  // Number Explorer / Calculator State
  const [explorerNumber, setExplorerNumber] = useState(500);

  // Reference Table Accordion
  const [showCheatsheet, setShowCheatsheet] = useState(false);

  const inputRef = useRef(null);

  // Initialize new question
  const nextQuestion = (preset = activePreset, mode = drillMode) => {
    const q = generateNumberQuestion(preset, mode);
    setCurrentQuestion(q);
    setSelectedOption(null);
    setTypedAnswer('');
    setShowResult(false);
    setIsCorrect(false);
    setMatchScore(null);

    // If audio mode, auto-play the target number speech after slight delay
    if (mode === 'audio_to_number') {
      setTimeout(() => {
        speakSpanish(q.spanishWord);
      }, 250);
    }
  };

  useEffect(() => {
    if (drillMode !== 'explorer') {
      nextQuestion(activePreset, drillMode);
    }
  }, [activePreset, drillMode]);

  useEffect(() => {
    if (inputStyle === 'typed' && !showResult && inputRef.current) {
      inputRef.current.focus();
    }
  }, [inputStyle, currentQuestion, showResult]);

  // Handle Option Click
  const handleSelectOption = (option) => {
    if (showResult || !currentQuestion) return;
    setSelectedOption(option);
    soundEngine.playTileClick();

    const correct = option.trim().toLowerCase() === currentQuestion.correctAnswer.trim().toLowerCase();
    evaluateAnswer(correct);
  };

  // Handle Typed Submit
  const handleTypedSubmit = (e) => {
    if (e) e.preventDefault();
    if (showResult || !currentQuestion || !typedAnswer.trim()) return;

    const scored = scoreTypedAnswer(typedAnswer, currentQuestion.correctAnswer);
    setMatchScore(scored);

    const correct = scored.status === 'exact' || scored.status === 'accent' || scored.status === 'close';
    evaluateAnswer(correct);
  };

  const evaluateAnswer = (correct) => {
    setIsCorrect(correct);
    setShowResult(true);

    if (correct) {
      soundEngine.playCorrect();
      setStats((prev) => {
        const newStreak = prev.streak + 1;
        if (newStreak % 5 === 0) soundEngine.playLevelUp();
        return {
          correct: prev.correct + 1,
          total: prev.total + 1,
          streak: newStreak,
        };
      });

      // Gamification award
      try {
        profileFetch(profileApiUrl('/spanish/api/gamification/action'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'numbers_practice', xp: 3 }),
        }).then(() => {
          window.dispatchEvent(new CustomEvent('gamification_updated'));
        }).catch(() => {});
      } catch {}
    } else {
      soundEngine.playWrong();
      setStats((prev) => ({
        ...prev,
        total: prev.total + 1,
        streak: 0,
      }));
    }
  };

  // Open Cartoon Modal
  const openCartoon = (cartoonId) => {
    soundEngine.playTileClick();
    setActiveCartoon(cartoonId);
  };

  // Keyboard shortcut listener for Esc / Enter
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && activeCartoon) {
        setActiveCartoon(null);
      }
      if (e.key === 'Enter' && showResult && drillMode !== 'explorer') {
        nextQuestion();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeCartoon, showResult, activePreset, drillMode]);

  // Explorer values
  const explorerSpanish = useMemo(() => numberToSpanish(explorerNumber), [explorerNumber]);
  const explorerPhonetics = useMemo(() => getSpanishNumberPhonetics(explorerNumber), [explorerNumber]);
  const explorerExplanation = useMemo(() => getSpanishNumberExplanation(explorerNumber), [explorerNumber]);

  return (
    <div className="space-y-6">
      {/* Cartoon Mnemonic Modal */}
      {activeCartoon && MNEMONIC_CARTOONS[activeCartoon] && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
          <div className="bg-gray-900 border border-purple-500/40 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-white">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-gray-900 via-purple-950 to-gray-900 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl sm:text-3xl">{MNEMONIC_CARTOONS[activeCartoon].emoji}</span>
                <div>
                  <h3 className="font-extrabold text-base sm:text-xl text-yellow-400 flex items-center gap-2">
                    {MNEMONIC_CARTOONS[activeCartoon].title}
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                      {MNEMONIC_CARTOONS[activeCartoon].number} = {MNEMONIC_CARTOONS[activeCartoon].word}
                    </span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {MNEMONIC_CARTOONS[activeCartoon].catchphrase}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => speakSpanish(MNEMONIC_CARTOONS[activeCartoon].word)}
                  title="Озвучить"
                  className="p-2 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 transition-colors"
                >
                  <Volume2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setActiveCartoon(null)}
                  className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Embedded Interactive HTML Cartoon */}
            <div className="relative flex-1 bg-black min-h-[380px] sm:min-h-[460px] w-full">
              <iframe
                src={MNEMONIC_CARTOONS[activeCartoon].url}
                title={MNEMONIC_CARTOONS[activeCartoon].title}
                className="w-full h-full border-0 absolute inset-0"
                allow="autoplay; audio"
              />
            </div>

            {/* Modal Footer with Mnemonics Guide */}
            <div className="p-4 sm:p-5 bg-gray-900 border-t border-gray-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2 font-bold text-yellow-400">
                  <Lightbulb className="w-4 h-4 text-yellow-400" />
                  <span>Транскрипция: [{MNEMONIC_CARTOONS[activeCartoon].phonetics}]</span>
                </div>
                <p className="text-xs sm:text-sm text-gray-300">
                  {MNEMONIC_CARTOONS[activeCartoon].tip}
                </p>
              </div>

              <button
                onClick={() => setActiveCartoon(null)}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2"
              >
                <span>Понял, в бой!</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Hero Cards: Cartoon Mnemonics Showcase */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 50 */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 p-5 sm:p-6 text-white border border-blue-700/40 shadow-xl group hover:border-blue-500/60 transition-all">
          <div className="absolute -right-8 -bottom-8 opacity-20 text-8xl pointer-events-none group-hover:scale-110 transition-transform">
            🦄
          </div>
          <div className="relative z-10 flex flex-col justify-between h-full space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl sm:text-4xl">🦄</span>
                <div>
                  <div className="text-xs uppercase tracking-wider text-blue-300 font-extrabold flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-blue-400" />
                    Мульт-подсказка для 50
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white">
                    50 = cincuenta
                  </h3>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-200 border border-blue-400/30 text-xs font-mono font-bold">
                син-КУЭН-та
              </span>
            </div>

            <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed">
              Не путай с пятнадцатью (quince)! Запомни: <strong className="text-yellow-300 font-bold">СИНИЙ КЕНТАВР</strong> скачет с числом 50 на боку!
            </p>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => openCartoon('50')}
                className="flex-1 py-2.5 px-4 rounded-xl font-bold bg-blue-500 hover:bg-blue-400 text-white shadow-md flex items-center justify-center gap-2 text-sm transition-transform active:scale-95"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Смотреть мультик со звуком</span>
              </button>
              <button
                onClick={() => speakSpanish('cincuenta')}
                title="Озвучить cincuenta"
                className="p-2.5 rounded-xl bg-blue-800/60 hover:bg-blue-700 text-blue-200 transition-colors"
              >
                <Volume2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Card 500 */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-950 via-orange-950 to-slate-900 p-5 sm:p-6 text-white border border-amber-600/40 shadow-xl group hover:border-amber-500/60 transition-all">
          <div className="absolute -right-8 -bottom-8 opacity-20 text-8xl pointer-events-none group-hover:scale-110 transition-transform">
            🎯
          </div>
          <div className="relative z-10 flex flex-col justify-between h-full space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl sm:text-4xl">🎯</span>
                <div>
                  <div className="text-xs uppercase tracking-wider text-amber-300 font-extrabold flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-amber-400" />
                    Мульт-подсказка для 500 (Исключение!)
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white">
                    500 = quinientos
                  </h3>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-200 border border-amber-400/30 text-xs font-mono font-bold">
                кинь-ЕН-тос
              </span>
            </div>

            <p className="text-xs sm:text-sm text-amber-100/90 leading-relaxed">
              «Cincocientos» не существует! Запомни чувака по имени Ентос: <strong className="text-yellow-300 font-bold">«КИfeatures: КИНЬ, ЕНТОС!»</strong> (500 монет).
            </p>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => openCartoon('500')}
                className="flex-1 py-2.5 px-4 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md flex items-center justify-center gap-2 text-sm transition-transform active:scale-95"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                <span>Смотреть мультик со звуком</span>
              </button>
              <button
                onClick={() => speakSpanish('quinientos')}
                title="Озвучить quinientos"
                className="p-2.5 rounded-xl bg-amber-900/60 hover:bg-amber-800 text-amber-200 transition-colors"
              >
                <Volume2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Navigation: Mode Selector & Stats Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2 bg-white/90 dark:bg-gray-800/90 rounded-2xl border border-purple-100 dark:border-gray-700 shadow-sm">
        {/* Practice Modes */}
        <div className="flex overflow-x-auto no-scrollbar gap-1.5">
          <button
            onClick={() => setDrillMode('number_to_word')}
            className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
              drillMode === 'number_to_word'
                ? 'bg-fuchsia-600 text-white shadow'
                : 'text-gray-600 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-gray-700'
            }`}
          >
            🔢 Число → Слово
          </button>
          <button
            onClick={() => setDrillMode('word_to_number')}
            className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
              drillMode === 'word_to_number'
                ? 'bg-fuchsia-600 text-white shadow'
                : 'text-gray-600 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-gray-700'
            }`}
          >
            🔤 Слово → Число
          </button>
          <button
            onClick={() => setDrillMode('audio_to_number')}
            className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
              drillMode === 'audio_to_number'
                ? 'bg-fuchsia-600 text-white shadow'
                : 'text-gray-600 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-gray-700'
            }`}
          >
            🔊 На слух (Аудио)
          </button>
          <button
            onClick={() => setDrillMode('explorer')}
            className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
              drillMode === 'explorer'
                ? 'bg-fuchsia-600 text-white shadow'
                : 'text-gray-600 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-gray-700'
            }`}
          >
            🔍 Справочник 1–1000
          </button>
        </div>

        {/* Stats Pill */}
        {drillMode !== 'explorer' && (
          <div className="flex items-center gap-3 px-3 py-1.5 bg-purple-50 dark:bg-purple-950/40 rounded-xl text-xs sm:text-sm">
            <div className="flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
              <Flame className="w-4 h-4 fill-amber-500 text-amber-500" />
              <span>{stats.streak} подряд</span>
            </div>
            <div className="w-px h-4 bg-purple-200 dark:bg-purple-800" />
            <div className="flex items-center gap-1 text-purple-700 dark:text-purple-300 font-semibold">
              <Trophy className="w-4 h-4 text-purple-500" />
              <span>{stats.correct}/{stats.total}</span>
            </div>
          </div>
        )}
      </div>

      {/* Preset Range Selector Pills (when not in explorer) */}
      {drillMode !== 'explorer' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Диапазон чисел для тренировки:
            </span>

            {/* Choice vs Keyboard Input toggle */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl text-xs">
              <button
                onClick={() => setInputStyle('choice')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  inputStyle === 'choice'
                    ? 'bg-white dark:bg-gray-700 text-purple-700 dark:text-purple-300 shadow-xs'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Варианты
              </button>
              <button
                onClick={() => setInputStyle('typed')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  inputStyle === 'typed'
                    ? 'bg-white dark:bg-gray-700 text-purple-700 dark:text-purple-300 shadow-xs'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Клавиатура
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {NUMBER_PRESETS.map((p) => {
              const isSelected = activePreset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    soundEngine.playTileClick();
                    setActivePreset(p.id);
                  }}
                  className={`p-2.5 rounded-2xl text-left border transition-all ${
                    isSelected
                      ? 'bg-purple-50 dark:bg-purple-900/40 border-purple-500 shadow-sm ring-2 ring-purple-400/20'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-purple-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-gray-900 dark:text-white">
                    <span>{p.emoji}</span>
                    <span className="truncate">{p.label}</span>
                  </div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">
                    {p.id === 'round' ? '10..1000 (19 чисел)' : p.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* EXPLORER MODE */}
      {drillMode === 'explorer' && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 sm:p-8 border border-purple-100 dark:border-gray-700 shadow-lg space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                <Search className="w-6 h-6 text-fuchsia-500" />
                Интерактивный справочник (1–1000)
              </h2>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                Введи любое число или используй ползунок — узнай написание, произношение и правила.
              </p>
            </div>

            <button
              onClick={() => speakSpanish(explorerSpanish)}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm flex items-center gap-2 shadow"
            >
              <Volume2 className="w-4 h-4" />
              <span>Озвучить</span>
            </button>
          </div>

          {/* Input & Range Slider */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <div className="sm:col-span-1">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                Число (от 1 до 1000):
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                value={explorerNumber}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(1000, Number(e.target.value) || 1));
                  setExplorerNumber(val);
                }}
                className="w-full text-2xl font-black px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-purple-600 dark:text-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="sm:col-span-2 space-y-2">
              <input
                type="range"
                min="1"
                max="1000"
                value={explorerNumber}
                onChange={(e) => setExplorerNumber(Number(e.target.value))}
                className="w-full accent-fuchsia-600 cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-gray-400 font-mono">
                <span>1</span>
                <span>50 🦄</span>
                <span>100</span>
                <span>500 🎯</span>
                <span>750</span>
                <span>1000</span>
              </div>
            </div>
          </div>

          {/* Quick preset chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-gray-400 font-bold">Быстрый переход:</span>
            {[5, 15, 16, 21, 22, 50, 100, 200, 500, 550, 700, 900, 1000].map((n) => (
              <button
                key={n}
                onClick={() => setExplorerNumber(n)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  explorerNumber === n
                    ? 'bg-fuchsia-600 text-white'
                    : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100'
                }`}
              >
                {n} {n === 50 ? '🦄' : n === 500 ? '🎯' : ''}
              </button>
            ))}
          </div>

          {/* Explorer Result Display Card */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-purple-50 to-fuchsia-50 dark:from-gray-900 dark:to-purple-950/40 border border-purple-200 dark:border-purple-800/40 text-center space-y-4">
            <div className="text-5xl sm:text-6xl font-black text-gray-900 dark:text-white font-mono tracking-tight">
              {explorerNumber}
            </div>

            <div className="space-y-1">
              <div className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-600 to-purple-600">
                {explorerSpanish}
              </div>
              <div className="text-sm font-mono text-gray-500 dark:text-gray-400">
                [{explorerPhonetics}]
              </div>
            </div>

            {/* Special cartoon CTA inside explorer */}
            {(explorerNumber === 50 || explorerNumber === 500) && (
              <div className="pt-2">
                <button
                  onClick={() => openCartoon(String(explorerNumber))}
                  className="px-5 py-2.5 rounded-2xl font-black bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg flex items-center justify-center gap-2 mx-auto hover:brightness-110 active:scale-95 transition-all text-sm"
                >
                  <Film className="w-4 h-4" />
                  <span>
                    Смотреть мультик «{MNEMONIC_CARTOONS[explorerNumber].title}» со звуком!
                  </span>
                </button>
              </div>
            )}

            {/* Grammar / Rule notes */}
            {explorerExplanation && (
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 max-w-xl mx-auto p-3 rounded-2xl bg-white/80 dark:bg-gray-800/80 border border-purple-100 dark:border-gray-700">
                {explorerExplanation}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DRILL / EXERCISE CARD */}
      {drillMode !== 'explorer' && currentQuestion && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 sm:p-8 border border-purple-100 dark:border-gray-700 shadow-lg space-y-6">
          {/* Question Header */}
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold uppercase px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                {drillMode === 'number_to_word' ? 'Число в слово' : drillMode === 'word_to_number' ? 'Слово в число' : 'На слух'}
              </span>
              {currentQuestion.hasCartoon && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center gap-1 animate-pulse">
                  <Sparkles className="w-3 h-3" />
                  Мультяшное число!
                </span>
              )}
            </div>

            {/* Audio Button for Question */}
            <button
              onClick={() => speakSpanish(currentQuestion.spanishWord)}
              title="Послушать произношение"
              className="p-2.5 rounded-xl bg-purple-50 dark:bg-gray-700 hover:bg-purple-100 dark:hover:bg-gray-600 text-purple-700 dark:text-purple-300 transition-colors"
            >
              <Volume2 className="w-5 h-5" />
            </button>
          </div>

          {/* Central Question Display */}
          <div className="text-center py-4 space-y-3">
            {drillMode === 'audio_to_number' ? (
              <div className="space-y-4">
                <button
                  onClick={() => speakSpanish(currentQuestion.spanishWord)}
                  className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white flex items-center justify-center shadow-xl active:scale-95 transition-all group"
                >
                  <Volume2 className="w-10 h-10 group-hover:scale-110 transition-transform" />
                </button>
                <div className="text-sm font-bold text-gray-500 dark:text-gray-400">
                  Нажми, чтобы послушать еще раз, и укажи верное число:
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-4xl sm:text-6xl font-black text-gray-900 dark:text-white font-mono tracking-tight">
                  {currentQuestion.questionDisplay}
                </div>
                {drillMode === 'word_to_number' && (
                  <div className="text-xs sm:text-sm font-mono text-purple-600 dark:text-purple-400">
                    [{currentQuestion.phonetics}]
                  </div>
                )}
              </div>
            )}

            {/* Mnemonic Hint Button if available */}
            {currentQuestion.hasCartoon && currentQuestion.mnemonic && !showResult && (
              <div className="pt-2">
                <button
                  onClick={() => openCartoon(currentQuestion.cartoonId)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 font-bold text-xs sm:text-sm transition-transform active:scale-95"
                >
                  <Film className="w-4 h-4 text-amber-500" />
                  <span>
                    Подсказка: мультик «{currentQuestion.mnemonic.title}»
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Answer Area: Choice Mode */}
          {inputStyle === 'choice' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {currentQuestion.options.map((opt, i) => {
                const isSelected = selectedOption === opt;
                let btnClass = 'bg-gray-50 dark:bg-gray-700/60 hover:bg-purple-50 dark:hover:bg-purple-900/30 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600';

                if (showResult) {
                  const isThisCorrect = opt.trim().toLowerCase() === currentQuestion.correctAnswer.trim().toLowerCase();
                  if (isThisCorrect) {
                    btnClass = 'bg-emerald-500 text-white border-emerald-600 shadow-md font-extrabold';
                  } else if (isSelected) {
                    btnClass = 'bg-rose-500 text-white border-rose-600 shadow-md font-extrabold';
                  } else {
                    btnClass = 'opacity-40 bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700';
                  }
                }

                return (
                  <button
                    key={i}
                    onClick={() => handleSelectOption(opt)}
                    disabled={showResult}
                    className={`p-4 rounded-2xl border-2 text-base sm:text-lg font-bold text-left transition-all active:scale-98 flex items-center justify-between ${btnClass}`}
                  >
                    <span>{opt}</span>
                    {showResult && opt.trim().toLowerCase() === currentQuestion.correctAnswer.trim().toLowerCase() && (
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    )}
                    {showResult && isSelected && opt.trim().toLowerCase() !== currentQuestion.correctAnswer.trim().toLowerCase() && (
                      <XCircle className="w-5 h-5 text-white" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Answer Area: Keyboard Input Mode */}
          {inputStyle === 'typed' && (
            <form onSubmit={handleTypedSubmit} className="space-y-4 pt-2">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={typedAnswer}
                  onChange={(e) => setTypedAnswer(e.target.value)}
                  disabled={showResult}
                  placeholder={drillMode === 'number_to_word' ? 'Напиши число по-испански...' : 'Введи число цифрами...'}
                  className="flex-1 px-5 py-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 text-lg font-bold text-gray-900 dark:text-white focus:outline-none focus:border-fuchsia-500 disabled:opacity-60"
                  autoCapitalize="none"
                  autoComplete="off"
                />
                {!showResult ? (
                  <button
                    type="submit"
                    disabled={!typedAnswer.trim()}
                    className="px-6 py-4 rounded-2xl font-bold bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-40 text-white shadow-md transition-all active:scale-95"
                  >
                    Проверить
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => nextQuestion()}
                    className="px-6 py-4 rounded-2xl font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-md transition-all active:scale-95 flex items-center gap-2"
                  >
                    <span>Дальше</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Spanish special char helper buttons */}
              {drillMode === 'number_to_word' && !showResult && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-gray-400">Буквы с ударением:</span>
                  {['é', 'ó', 'í', 'á', 'ú', 'ñ'].map((char) => (
                    <button
                      key={char}
                      type="button"
                      onClick={() => setTypedAnswer((prev) => prev + char)}
                      className="px-3 py-1 rounded-xl bg-purple-50 dark:bg-gray-700 hover:bg-purple-100 text-purple-700 dark:text-purple-300 font-bold text-sm"
                    >
                      {char}
                    </button>
                  ))}
                </div>
              )}
            </form>
          )}

          {/* Result Feedback Banner */}
          {showResult && (
            <div
              className={`p-5 rounded-2xl border-2 space-y-3 animate-fadeIn ${
                isCorrect
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/60 text-emerald-900 dark:text-emerald-100'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700/60 text-rose-900 dark:text-rose-100'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {isCorrect ? (
                    <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-7 h-7 text-rose-600 shrink-0" />
                  )}
                  <div>
                    <div className="font-extrabold text-base sm:text-lg">
                      {isCorrect ? '¡Excelente! Правильно!' : 'Ошибочка! Запоминаем правильный ответ:'}
                    </div>
                    <div className="text-sm font-semibold flex items-center gap-2 mt-0.5">
                      <span>{currentQuestion.targetNum} = </span>
                      <strong className="underline decoration-2">{currentQuestion.spanishWord}</strong>
                      <span className="font-mono text-xs opacity-80">[{currentQuestion.phonetics}]</span>
                    </div>
                  </div>
                </div>

                {/* Next button */}
                <button
                  onClick={() => nextQuestion()}
                  className="px-6 py-2.5 rounded-xl font-bold bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow hover:opacity-90 transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <span>Следующее число</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Grammar / Explanation tip */}
              {currentQuestion.explanation && (
                <div className="text-xs sm:text-sm p-3 rounded-xl bg-white/60 dark:bg-gray-800/60 border border-black/5 dark:border-white/5">
                  {currentQuestion.explanation}
                </div>
              )}

              {/* Special CTA to watch the cartoon if target was 50 or 500 */}
              {currentQuestion.hasCartoon && currentQuestion.mnemonic && (
                <div className="pt-1">
                  <button
                    onClick={() => openCartoon(currentQuestion.cartoonId)}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl font-black bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow flex items-center justify-center gap-2 text-xs sm:text-sm hover:brightness-110 active:scale-95 transition-all"
                  >
                    <Play className="w-4 h-4 fill-slate-950" />
                    <span>
                      Смотреть мультик «{currentQuestion.mnemonic.title}» со звуком!
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Accordion: Quick Cheatsheet & Grammar Rules */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 sm:p-6 border border-purple-100 dark:border-gray-700 shadow-sm space-y-4">
        <button
          onClick={() => setShowCheatsheet(!showCheatsheet)}
          className="w-full flex items-center justify-between text-left group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-gray-900 dark:text-white group-hover:text-fuchsia-600 transition-colors">
                Шпаргалка: правила образования чисел и исключения
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Слитные 20-е, союз «y», cien vs ciento, исключения 500 (*quinientos*), 700 (*setecientos*), 900 (*novecientos*)
              </p>
            </div>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
            {showCheatsheet ? 'Скрыть ▲' : 'Открыть ▼'}
          </span>
        </button>

        {showCheatsheet && (
          <div className="pt-4 border-t border-gray-100 dark:border-gray-700 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs sm:text-sm animate-fadeIn">
            {/* Rules 1 */}
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700/60 space-y-2">
              <div className="font-black text-fuchsia-600 dark:text-fuchsia-400 uppercase text-xs tracking-wider">
                1. От 1 до 29 (Слитные!)
              </div>
              <ul className="space-y-1.5 text-gray-600 dark:text-gray-300">
                <li>• <strong>1–15:</strong> уникальные корни (once, doce, trece, catorce, quince).</li>
                <li>• <strong>16–19:</strong> пишутся в одно слово с <code className="text-purple-600">dieci-</code> (dieciséis с ударением).</li>
                <li>• <strong>21–29:</strong> ВСЕГДА в ОДНО слово с <code className="text-purple-600">veinti-</code> (veintiuno, veintidós, veinticinco).</li>
              </ul>
            </div>

            {/* Rules 2 */}
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700/60 space-y-2">
              <div className="font-black text-blue-600 dark:text-blue-400 uppercase text-xs tracking-wider">
                2. Десятки 30–99 (Правило «y»)
              </div>
              <ul className="space-y-1.5 text-gray-600 dark:text-gray-300">
                <li>• <strong>30–99:</strong> десятки пишутся раздельно через союз «y» (treinta y uno, cuarenta y dos).</li>
                <li>• <strong>50 = cincuenta:</strong> помни <span className="text-blue-500 font-bold">Синего Кентавра</span>!</li>
                <li>• <strong>60 vs 70:</strong> sesenta (с «s») vs setenta (с «t»).</li>
              </ul>
            </div>

            {/* Rules 3 */}
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700/60 space-y-2">
              <div className="font-black text-amber-600 dark:text-amber-400 uppercase text-xs tracking-wider">
                3. Сотни 100–1000 (Ловушки)
              </div>
              <ul className="space-y-1.5 text-gray-600 dark:text-gray-300">
                <li>• <strong>100:</strong> ровно <code className="text-amber-600">cien</code>, но 101–199 = <code className="text-amber-600">ciento</code>.</li>
                <li>• <strong>500:</strong> <strong className="text-amber-500">quinientos</strong> (НЕ cincocientos! <span className="font-bold">«Кинь, Ентос!»</span>).</li>
                <li>• <strong>700:</strong> <strong className="text-amber-500">setecientos</strong> (sete, не siete).</li>
                <li>• <strong>900:</strong> <strong className="text-amber-500">novecientos</strong> (nove, не nueve).</li>
                <li>• <strong>1000:</strong> просто <code className="text-amber-600">mil</code> (не un mil).</li>
              </ul>
            </div>

            {/* 18 Round Numbers Cheat Grid */}
            <div className="md:col-span-3 p-4 rounded-2xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/40 space-y-3">
              <div className="font-black text-purple-900 dark:text-purple-200 text-xs uppercase tracking-wider flex items-center justify-between">
                <span>19 ключевых круглых чисел (нажми, чтобы послушать):</span>
                <span className="text-[11px] text-purple-500 font-normal">Особые: 50 🦄 и 500 🎯</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                {ROUND_NUMBERS_10_TO_1000.map((num) => {
                  const sp = numberToSpanish(num);
                  const isCartoon = num === 50 || num === 500;
                  return (
                    <button
                      key={num}
                      onClick={() => speakSpanish(sp)}
                      className={`p-2 rounded-xl text-left border text-xs font-bold transition-all hover:scale-102 active:scale-95 flex items-center justify-between ${
                        isCartoon
                          ? 'bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-600 text-amber-900 dark:text-amber-200'
                          : 'bg-white dark:bg-gray-800 border-purple-100 dark:border-gray-700 text-gray-800 dark:text-gray-200'
                      }`}
                    >
                      <div>
                        <div className="text-[10px] text-gray-400 font-mono">{num}</div>
                        <div>{sp}</div>
                      </div>
                      <Volume2 className="w-3.5 h-3.5 opacity-60" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
