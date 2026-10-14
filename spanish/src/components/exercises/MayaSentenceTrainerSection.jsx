import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Volume2, Sparkles, CheckCircle2, RotateCcw, ArrowRight, ArrowLeft,
  Star, Trophy, HelpCircle, Shuffle, ChevronRight, Award, Check, RefreshCw
} from 'lucide-react';
import { soundEngine, speakSpanish } from '../../utils/soundEffects';
import { profileFetch, profileApiUrl } from '../../utils/api';
import {
  EXERCISES_ES_TO_RU,
  EXERCISES_RU_TO_ES,
  getExercise,
  isMayaSentenceAnswerCorrect,
  generateWordTilesForSentence
} from '../../utils/mayaSentencesData';

const PROGRESS_STORAGE_KEY = 'lingua_maya_sentence_trainer_progress_v1';

function loadStoredProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveStoredProgress(progress) {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {}
}

export default function MayaSentenceTrainerSection({ initialDirection = 'es_to_ru', initialExerciseId = 1 }) {
  const [direction, setDirection] = useState(initialDirection); // 'es_to_ru' | 'ru_to_es'
  const [activeExerciseId, setActiveExerciseId] = useState(initialExerciseId); // 1 .. 5
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0); // 0 .. 19

  // Input states
  const [selectedTiles, setSelectedTiles] = useState([]);
  const [availableTiles, setAvailableTiles] = useState([]);
  const [typedInput, setTypedInput] = useState('');
  const [inputMode, setInputMode] = useState('tiles'); // 'tiles' | 'text'

  // Result & feedback
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Stored progress: { [sentenceId]: boolean }
  const [completedMap, setCompletedMap] = useState(() => loadStoredProgress());

  const inputRef = useRef(null);

  // Current exercise & sentence
  const exerciseList = direction === 'ru_to_es' ? EXERCISES_RU_TO_ES : EXERCISES_ES_TO_RU;
  const currentExercise = useMemo(() => {
    return exerciseList.find((ex) => ex.id === activeExerciseId) || exerciseList[0];
  }, [exerciseList, activeExerciseId]);

  const sentences = currentExercise.sentences;
  const currentSentence = sentences[currentSentenceIndex] || sentences[0];

  // Initialize or reset current sentence state
  const resetSentenceState = (sentence = currentSentence, dir = direction) => {
    const tiles = generateWordTilesForSentence(sentence, dir);
    setAvailableTiles(tiles);
    setSelectedTiles([]);
    setTypedInput('');
    setIsAnswered(false);
    setIsCorrect(false);
    setShowHint(false);
  };

  useEffect(() => {
    resetSentenceState(currentSentence, direction);
  }, [currentSentenceIndex, activeExerciseId, direction]);

  // Handle switching direction
  const handleDirectionChange = (newDir) => {
    if (newDir === direction) return;
    soundEngine.playTileClick();
    setDirection(newDir);
    setCurrentSentenceIndex(0);
  };

  // Handle selecting an exercise (1 .. 5)
  const handleSelectExercise = (exId) => {
    if (exId === activeExerciseId) return;
    soundEngine.playTileClick();
    setActiveExerciseId(exId);
    setCurrentSentenceIndex(0);
  };

  // Word tile click handlers
  const handleAddTile = (tile) => {
    if (isAnswered && isCorrect) return;
    soundEngine.playTileClick();
    setAvailableTiles((prev) => prev.filter((t) => t.id !== tile.id));
    setSelectedTiles((prev) => [...prev, tile]);
  };

  const handleRemoveTile = (tile) => {
    if (isAnswered && isCorrect) return;
    soundEngine.playTileClick();
    setSelectedTiles((prev) => prev.filter((t) => t.id !== tile.id));
    setAvailableTiles((prev) => [...prev, tile]);
  };

  const handleClearTiles = () => {
    soundEngine.playTileClick();
    resetSentenceState(currentSentence, direction);
  };

  // Add accent character to text input
  const handleInsertChar = (char) => {
    soundEngine.playTileClick();
    setTypedInput((prev) => prev + char);
    if (inputRef.current) inputRef.current.focus();
  };

  // Check Answer
  const handleCheckAnswer = () => {
    if (isAnswered && isCorrect) return;

    let answerText = '';
    if (inputMode === 'tiles') {
      answerText = selectedTiles.map((t) => t.text).join(' ');
    } else {
      answerText = typedInput.trim();
    }

    if (!answerText) return;

    const correct = isMayaSentenceAnswerCorrect(answerText, currentSentence);
    setIsAnswered(true);
    setIsCorrect(correct);

    if (correct) {
      soundEngine.playSuccess();
      // Pronounce the Spanish sentence
      speakSpanish(currentSentence.spanish);

      // Save progress
      const newMap = { ...completedMap, [currentSentence.id]: true };
      setCompletedMap(newMap);
      saveStoredProgress(newMap);

      // Log attempt to backend for parent reports
      try {
        profileFetch(profileApiUrl('/spanish/api/vocabulary/log-attempt'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentToken: 'maya',
            word: currentSentence.verbForm,
            translation: currentSentence.verb,
            direction: direction === 'ru_to_es' ? 'target_to_source' : 'source_to_target',
            prompt: direction === 'ru_to_es' ? currentSentence.russian : currentSentence.spanish,
            expectedAnswer: direction === 'ru_to_es' ? currentSentence.spanish : currentSentence.russian,
            userInput: answerText,
            isCorrect: true,
            grade: 'easy',
            practiceMode: 'maya_sentence_training',
            groupName: `Майя: ${currentExercise.title}`
          })
        }).catch(() => {});
      } catch {}
    } else {
      soundEngine.playError();
      try {
        profileFetch(profileApiUrl('/spanish/api/vocabulary/log-attempt'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentToken: 'maya',
            word: currentSentence.verbForm,
            translation: currentSentence.verb,
            direction: direction === 'ru_to_es' ? 'target_to_source' : 'source_to_target',
            prompt: direction === 'ru_to_es' ? currentSentence.russian : currentSentence.spanish,
            expectedAnswer: direction === 'ru_to_es' ? currentSentence.spanish : currentSentence.russian,
            userInput: answerText,
            isCorrect: false,
            grade: 'hard',
            practiceMode: 'maya_sentence_training',
            groupName: `Майя: ${currentExercise.title}`
          })
        }).catch(() => {});
      } catch {}
    }
  };

  // Next / Previous sentence navigation
  const handleNext = () => {
    soundEngine.playTileClick();
    if (currentSentenceIndex < sentences.length - 1) {
      setCurrentSentenceIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    soundEngine.playTileClick();
    if (currentSentenceIndex > 0) {
      setCurrentSentenceIndex((prev) => prev - 1);
    }
  };

  // Calculate stats for current exercise
  const exerciseCompletedCount = useMemo(() => {
    return sentences.filter((s) => completedMap[s.id]).length;
  }, [sentences, completedMap]);

  const isExerciseFinished = exerciseCompletedCount === sentences.length;

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="rounded-3xl p-5 sm:p-6 bg-gradient-to-r from-rose-500 via-fuchsia-600 to-indigo-600 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white to-transparent pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-black tracking-wide uppercase mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Детский тренажер предложений для Майи</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black flex items-center gap-2">
              <span>⭐</span>
              <span>100 предложений ES → RU и 100 предложений RU → ES</span>
            </h2>
            <p className="text-white/90 text-sm mt-1 max-w-2xl">
              Только правильные глаголы (<strong>dibujar, pintar, comer, correr, escuchar, mirar, comprar, saltar, esperar, ayudar</strong>) и знакомые слова из 100 карточек Майи. Все 200 предложений разные!
            </p>
          </div>

          {/* Overall progress indicator */}
          <div className="bg-white/15 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/20 shrink-0 text-center">
            <div className="text-xs text-white/80 font-bold uppercase">Пройдено предложений</div>
            <div className="text-2xl font-black text-amber-300">
              {Object.keys(completedMap).length} <span className="text-sm font-semibold text-white/80">/ 200</span>
            </div>
          </div>
        </div>

        {/* Direction Switcher Pills */}
        <div className="mt-5 pt-4 border-t border-white/20 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => handleDirectionChange('es_to_ru')}
            className={`px-4 py-2.5 rounded-2xl font-black text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95 ${
              direction === 'es_to_ru'
                ? 'bg-white text-fuchsia-900 shadow-md ring-2 ring-white scale-102'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            <span className="text-base">🇪🇸 ➡️ 🇷🇺</span>
            <span>Испанский → Русский (5 упр. по 20)</span>
          </button>

          <button
            type="button"
            onClick={() => handleDirectionChange('ru_to_es')}
            className={`px-4 py-2.5 rounded-2xl font-black text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95 ${
              direction === 'ru_to_es'
                ? 'bg-white text-fuchsia-900 shadow-md ring-2 ring-white scale-102'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            <span className="text-base">🇷🇺 ➡️ 🇪🇸</span>
            <span>Русский → Испанский (5 упр. по 20)</span>
          </button>
        </div>
      </div>

      {/* 2. Exercise Selection Cards ("5 упражнений отдельно включаемых") */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Выбери упражнение ({direction === 'es_to_ru' ? '🇪🇸 Испанский → 🇷🇺 Русский' : '🇷🇺 Русский → 🇪🇸 Испанский'}):
          </div>
          <div className="text-xs text-slate-500 font-semibold">
            По 20 предложений в каждом
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {exerciseList.map((ex) => {
            const isSelected = ex.id === activeExerciseId;
            const solvedInEx = ex.sentences.filter((s) => completedMap[s.id]).length;
            const isFull = solvedInEx === ex.sentences.length;

            return (
              <button
                key={ex.id}
                type="button"
                onClick={() => handleSelectExercise(ex.id)}
                className={`p-3.5 rounded-2xl text-left transition-all border-2 flex flex-col justify-between gap-2.5 cursor-pointer active:scale-98 ${
                  isSelected
                    ? 'border-fuchsia-500 bg-fuchsia-50/90 dark:bg-fuchsia-950/40 shadow-md ring-2 ring-fuchsia-400/50'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-fuchsia-200 hover:bg-fuchsia-50/30'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xl">{ex.icon}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-black ${
                        isFull
                          ? 'bg-emerald-500 text-white'
                          : solvedInEx > 0
                          ? 'bg-fuchsia-100 dark:bg-fuchsia-900/60 text-fuchsia-700 dark:text-fuchsia-300'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {solvedInEx} / 20 {isFull && '⭐'}
                    </span>
                  </div>
                  <div className="font-extrabold text-sm text-slate-900 dark:text-white mt-1.5">
                    {ex.shortTitle}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-snug">
                    {ex.description}
                  </p>
                </div>

                {/* Progress bar inside card */}
                <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isFull ? 'bg-emerald-500' : 'bg-fuchsia-500'
                    }`}
                    style={{ width: `${(solvedInEx / 20) * 100}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Interactive Sentence Practice Card */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 sm:p-7 border border-slate-200 dark:border-slate-700 shadow-xl space-y-6">
        {/* Top sentence bar: Exercise Title & Sentence Picker */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-700/60">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{currentExercise.icon}</span>
            <div>
              <div className="text-xs font-black uppercase text-fuchsia-600 dark:text-fuchsia-400">
                {currentExercise.title}
              </div>
              <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                Предложение {currentSentenceIndex + 1} из 20
              </div>
            </div>
          </div>

          {/* Quick 20 dots picker */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            {sentences.map((s, idx) => {
              const isDone = Boolean(completedMap[s.id]);
              const isCurrent = idx === currentSentenceIndex;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playTileClick();
                    setCurrentSentenceIndex(idx);
                  }}
                  className={`w-7 h-7 rounded-lg text-xs font-black transition-all flex items-center justify-center cursor-pointer shrink-0 ${
                    isCurrent
                      ? 'bg-fuchsia-600 text-white ring-2 ring-fuchsia-400 ring-offset-1 scale-110'
                      : isDone
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                  title={`Предложение ${idx + 1}`}
                >
                  {isDone && !isCurrent ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Prompt Display */}
        <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-slate-50 to-purple-50/40 dark:from-slate-900/40 dark:to-purple-950/20 border border-purple-100 dark:border-purple-900/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                {direction === 'es_to_ru' ? '🇪🇸 Испанская фраза' : '🇷🇺 Русская фраза'}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                Глагол: <strong>{currentSentence.verb}</strong> ({currentSentence.verbPerson})
              </span>
            </div>

            <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white pt-1">
              {direction === 'es_to_ru' ? currentSentence.spanish : currentSentence.russian}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Pronounce button */}
            <button
              type="button"
              onClick={() => {
                soundEngine.playTileClick();
                speakSpanish(currentSentence.spanish);
              }}
              className="px-3.5 py-2 rounded-2xl bg-white dark:bg-slate-800 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-200 dark:border-fuchsia-800/60 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-950/40 font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
              title="Послушать испанское произношение"
            >
              <Volume2 className="w-4 h-4 text-fuchsia-600" />
              <span>Послушать</span>
            </button>

            {/* Hint toggle */}
            <button
              type="button"
              onClick={() => {
                soundEngine.playTileClick();
                setShowHint((prev) => !prev);
              }}
              className="px-3 py-2 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 font-bold text-xs sm:text-sm flex items-center gap-1.5 hover:bg-amber-100 active:scale-95 transition-all cursor-pointer"
              title="Показать подсказку"
            >
              <HelpCircle className="w-4 h-4 text-amber-600" />
              <span>Подсказка</span>
            </button>
          </div>
        </div>

        {/* Optional Hint Banner */}
        {showHint && (
          <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100 text-xs sm:text-sm animate-fadeIn flex items-center gap-2">
            <span className="text-base">💡</span>
            <div>{currentSentence.hint}</div>
          </div>
        )}

        {/* Mode switcher: Word Tiles vs Keyboard */}
        <div className="flex items-center justify-between">
          <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
            {direction === 'es_to_ru' ? 'Собери или напиши перевод на русском:' : 'Собери или напиши перевод на испанском:'}
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-700/60 rounded-xl">
            <button
              type="button"
              onClick={() => setInputMode('tiles')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                inputMode === 'tiles'
                  ? 'bg-white dark:bg-slate-800 text-fuchsia-700 dark:text-fuchsia-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Слова-карточки 🧩
            </button>
            <button
              type="button"
              onClick={() => {
                setInputMode('text');
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                inputMode === 'text'
                  ? 'bg-white dark:bg-slate-800 text-fuchsia-700 dark:text-fuchsia-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Печатать ⌨️
            </button>
          </div>
        </div>

        {/* 5. Answer Input Area */}
        {inputMode === 'tiles' ? (
          <div className="space-y-4">
            {/* Selected Tiles Slot */}
            <div className="min-h-[72px] p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border-2 border-dashed border-fuchsia-200 dark:border-fuchsia-900/60 flex flex-wrap items-center gap-2">
              {selectedTiles.length === 0 ? (
                <span className="text-sm text-slate-400 italic">
                  Нажимай на слова внизу, чтобы составить предложение...
                </span>
              ) : (
                selectedTiles.map((tile) => (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() => handleRemoveTile(tile)}
                    disabled={isAnswered && isCorrect}
                    className="px-3.5 py-2 rounded-xl bg-fuchsia-600 text-white font-extrabold text-sm sm:text-base shadow-md hover:bg-fuchsia-700 active:scale-95 transition-all cursor-pointer flex items-center gap-1 group"
                  >
                    <span>{tile.text}</span>
                    <span className="text-xs text-white/70 group-hover:text-white">✕</span>
                  </button>
                ))
              )}
            </div>

            {/* Clear button if tiles chosen */}
            {selectedTiles.length > 0 && !isCorrect && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleClearTiles}
                  className="text-xs font-bold text-slate-500 hover:text-rose-500 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Сбросить выбранные слова</span>
                </button>
              </div>
            )}

            {/* Available Tiles Pool */}
            <div className="p-4 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/40">
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2.5">
                Выбирай слова:
              </div>
              <div className="flex flex-wrap gap-2.5">
                {availableTiles.map((tile) => (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() => handleAddTile(tile)}
                    disabled={isAnswered && isCorrect}
                    className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-extrabold text-sm sm:text-base border border-slate-200 dark:border-slate-700 shadow-sm hover:border-fuchsia-300 hover:bg-fuchsia-50/60 dark:hover:bg-fuchsia-950/40 active:scale-95 transition-all cursor-pointer"
                  >
                    {tile.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Text input mode */
          <div className="space-y-3">
            <input
              ref={inputRef}
              type="text"
              value={typedInput}
              onChange={(e) => setTypedInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCheckAnswer();
              }}
              placeholder={direction === 'es_to_ru' ? 'Введи перевод на русском...' : 'Введи перевод на испанском...'}
              className="w-full px-4 py-3.5 rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 focus:border-fuchsia-500 dark:focus:border-fuchsia-400 focus:outline-none text-base sm:text-lg font-bold text-slate-900 dark:text-white"
            />

            {/* Spanish accent helper bar for RU -> ES */}
            {direction === 'ru_to_es' && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs text-slate-400 font-bold mr-1">Буквы:</span>
                {['á', 'é', 'í', 'ó', 'ú', 'ñ', '¡', '¿'].map((char) => (
                  <button
                    key={char}
                    type="button"
                    onClick={() => handleInsertChar(char)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs hover:bg-fuchsia-100 dark:hover:bg-fuchsia-900 active:scale-95 cursor-pointer"
                  >
                    {char}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 6. Result & Feedback Banner */}
        {isAnswered && (
          <div
            className={`p-4 rounded-2xl border text-sm sm:text-base animate-fadeIn flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isCorrect
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-100'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-100'
            }`}
          >
            <div className="flex items-center gap-3">
              {isCorrect ? (
                <div className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                  <Check className="w-5 h-5 stroke-[3]" />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-full bg-rose-500 text-white flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5 stroke-[2.5]" />
                </div>
              )}
              <div>
                <div className="font-black text-base">
                  {isCorrect ? '¡Excelente! ⭐ Всё правильно!' : 'Почти получилось! Попробуем ещё раз?'}
                </div>
                {!isCorrect && (
                  <div className="text-xs sm:text-sm mt-0.5 opacity-90">
                    Правильный перевод: <strong>{direction === 'es_to_ru' ? currentSentence.russian : currentSentence.spanish}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Retry or Next button */}
            <div className="flex items-center gap-2">
              {!isCorrect && (
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playTileClick();
                    setIsAnswered(false);
                    setSelectedTiles([]);
                    setAvailableTiles(generateWordTilesForSentence(currentSentence, direction));
                    setTypedInput('');
                  }}
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 text-rose-700 dark:text-rose-300 font-bold text-xs border border-rose-200 active:scale-95 cursor-pointer"
                >
                  Попробовать снова
                </button>
              )}

              {currentSentenceIndex < sentences.length - 1 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white font-black text-xs sm:text-sm shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Дальше</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <div className="text-xs font-black text-emerald-700 dark:text-emerald-300">
                  🎉 Это последнее предложение в упражнении!
                </div>
              )}
            </div>
          </div>
        )}

        {/* 7. Action Bar: Check Button & Navigation */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentSentenceIndex === 0}
            className={`px-3.5 py-2.5 rounded-2xl font-extrabold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer ${
              currentSentenceIndex === 0
                ? 'opacity-40 cursor-not-allowed text-slate-400'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 active:scale-95'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Назад</span>
          </button>

          {!isAnswered || !isCorrect ? (
            <button
              type="button"
              onClick={handleCheckAnswer}
              disabled={inputMode === 'tiles' ? selectedTiles.length === 0 : !typedInput.trim()}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-fuchsia-600 via-rose-500 to-amber-500 hover:from-fuchsia-700 hover:to-amber-600 text-white font-black text-sm sm:text-base shadow-lg shadow-fuchsia-500/25 active:scale-95 transition-all disabled:opacity-50 disabled:shadow-none cursor-pointer flex items-center gap-2"
            >
              <span>Проверить ответ</span>
              <Sparkles className="w-4 h-4" />
            </button>
          ) : (
            currentSentenceIndex < sentences.length - 1 && (
              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-sm sm:text-base shadow-lg active:scale-95 transition-all cursor-pointer flex items-center gap-2"
              >
                <span>Следующее предложение</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )
          )}

          <button
            type="button"
            onClick={handleNext}
            disabled={currentSentenceIndex === sentences.length - 1}
            className={`px-3.5 py-2.5 rounded-2xl font-extrabold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer ${
              currentSentenceIndex === sentences.length - 1
                ? 'opacity-40 cursor-not-allowed text-slate-400'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 active:scale-95'
            }`}
          >
            <span>Вперёд</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* 8. Exercise Finished Celebration Card */}
        {isExerciseFinished && (
          <div className="p-6 rounded-3xl bg-gradient-to-r from-amber-400 via-rose-400 to-fuchsia-500 text-white shadow-xl text-center space-y-3 animate-fadeIn">
            <div className="text-4xl">🎈⭐🎉</div>
            <h3 className="text-xl sm:text-2xl font-black">
              Ура! Упражнение {currentExercise.id} пройдено на 20 из 20!
            </h3>
            <p className="text-white/95 text-xs sm:text-sm max-w-md mx-auto">
              Ты отлично потренировала формы правильных глаголов! Все 20 предложений решены правильно!
            </p>
            <div className="pt-2 flex flex-wrap justify-center gap-2.5">
              {activeExerciseId < 5 ? (
                <button
                  type="button"
                  onClick={() => handleSelectExercise(activeExerciseId + 1)}
                  className="px-5 py-2.5 rounded-2xl bg-white text-fuchsia-900 font-black text-xs sm:text-sm shadow-md hover:bg-fuchsia-50 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span>Перейти к упр. {activeExerciseId + 1}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleDirectionChange(direction === 'es_to_ru' ? 'ru_to_es' : 'es_to_ru')}
                  className="px-5 py-2.5 rounded-2xl bg-white text-fuchsia-900 font-black text-xs sm:text-sm shadow-md hover:bg-fuchsia-50 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span>Попробовать обратное направление ({direction === 'es_to_ru' ? 'RU ➡️ ES' : 'ES ➡️ RU'})</span>
                  <Shuffle className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
