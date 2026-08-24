import React, { useState, useEffect, useMemo } from 'react';
import {
  Volume2, ArrowRight, ArrowLeft, CheckCircle2, XCircle,
  Sparkles, RefreshCw, Trophy, BookOpen, Layers, Check, Zap
} from 'lucide-react';
import { soundEngine, speakSpanish } from '../utils/soundEffects';
import VocabularyWordIllustration, { getWordVisualMeta } from './VocabularyWordIllustration';

const CHUNK_SIZE = 3;

export default function InteractiveVocabularyIntro({
  words = [],
  topicName = '',
  onComplete,
  onSkipToTheory,
  isEnrolling = false
}) {
  const [chunkIdx, setChunkIdx] = useState(0);
  const [subPhase, setSubPhase] = useState('presenting'); // 'presenting' | 'testing' | 'chunk_done'
  const [cardInChunkIdx, setCardInChunkIdx] = useState(0);
  
  // Testing state
  const [testIdx, setTestIdx] = useState(0);
  const [testSelected, setTestSelected] = useState(null);
  const [testScore, setTestScore] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  // Divide words into chunks of 3
  const chunks = useMemo(() => {
    if (!words || words.length === 0) return [];
    const list = [];
    for (let i = 0; i < words.length; i += CHUNK_SIZE) {
      list.push(words.slice(i, i + CHUNK_SIZE));
    }
    return list;
  }, [words]);

  const currentChunk = chunks[chunkIdx] || [];
  const currentWord = currentChunk[cardInChunkIdx];
  const totalChunks = chunks.length;

  // Auto-speak on card presentation
  useEffect(() => {
    if (subPhase === 'presenting' && currentWord) {
      speakSpanish(currentWord.word);
    }
  }, [currentWord, subPhase]);

  // Build testing items for the current chunk (current chunk + 1 review word from earlier chunks)
  const currentTestItems = useMemo(() => {
    if (!currentChunk || currentChunk.length === 0) return [];
    const baseList = [...currentChunk];

    // Interleaving: add 1 review word from previous chunks if available
    if (chunkIdx > 0) {
      const prevWords = words.slice(0, chunkIdx * CHUNK_SIZE);
      if (prevWords.length > 0) {
        const randomPrev = prevWords[Math.floor(Math.random() * prevWords.length)];
        baseList.push(randomPrev);
      }
    }

    return baseList.sort(() => 0.5 - Math.random()).map(w => {
      // Pick 3 distractors from all topic words
      const distractors = words
        .filter(o => o.word !== w.word)
        .map(o => o.translation)
        .sort(() => 0.5 - Math.random())
        .slice(0, 3);
      
      const options = [w.translation, ...distractors].sort(() => 0.5 - Math.random());
      return {
        ...w,
        options,
        correctOption: w.translation
      };
    });
  }, [currentChunk, chunkIdx, words]);

  // Handle Presentation Next
  const handlePresentationNext = () => {
    soundEngine.playTileClick();
    if (cardInChunkIdx < currentChunk.length - 1) {
      setCardInChunkIdx(i => i + 1);
    } else {
      // Start testing this chunk
      setSubPhase('testing');
      setTestIdx(0);
      setTestSelected(null);
      soundEngine.playLevelUp();
    }
  };

  const handlePresentationPrev = () => {
    soundEngine.playTileClick();
    if (cardInChunkIdx > 0) {
      setCardInChunkIdx(i => i - 1);
    }
  };

  // Handle Test option click
  const handleTestSelect = (opt) => {
    if (testSelected !== null) return;
    setTestSelected(opt);
    const isCorrect = opt === currentTestItems[testIdx]?.correctOption;
    if (isCorrect) {
      soundEngine.playCorrect();
      setTestScore(s => s + 1);
    } else {
      soundEngine.playWrong();
    }

    setTimeout(() => {
      if (testIdx < currentTestItems.length - 1) {
        setTestIdx(i => i + 1);
        setTestSelected(null);
      } else {
        // Chunk test completed
        if (chunkIdx < totalChunks - 1) {
          setSubPhase('chunk_done');
          soundEngine.playLevelUp();
        } else {
          // All chunks completed!
          setIsCompleted(true);
          soundEngine.playLevelUp();
        }
      }
    }, 850);
  };

  const handleNextChunk = () => {
    soundEngine.playTileClick();
    setChunkIdx(c => c + 1);
    setSubPhase('presenting');
    setCardInChunkIdx(0);
    setTestIdx(0);
    setTestSelected(null);
  };

  if (!words || words.length === 0) {
    return (
      <div className="text-center py-10 space-y-4">
        <p className="text-gray-500">Слова для этой темы загружаются...</p>
        <button
          onClick={onSkipToTheory}
          className="px-6 py-2.5 rounded-xl bg-purple-600 text-white font-bold"
        >
          Перейти к теории
        </button>
      </div>
    );
  }

  // ----------------------------------------------------
  // FINAL COMPLETION SCREEN
  // ----------------------------------------------------
  if (isCompleted) {
    return (
      <div className="max-w-xl mx-auto text-center py-8 space-y-6 animate-fadeIn">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-400 to-green-600 text-white flex items-center justify-center mx-auto text-5xl shadow-2xl animate-bounce">
          🏆
        </div>

        <div>
          <h3 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mb-2">
            Все {words.length} слов успешно освоены!
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 max-w-md mx-auto">
            Вы познакомились со всеми порциями слов и закрепили их на лету. Слова готовы к переносу в ваш интервальный словарь!
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 flex items-center justify-between text-left">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📇</span>
            <div>
              <div className="text-xs font-black text-purple-900 dark:text-purple-200">
                Автоматическое сохранение в Словарь
              </div>
              <div className="text-[11px] text-purple-700 dark:text-purple-300">
                {words.length} карточек будут добавлены в группу темы
              </div>
            </div>
          </div>
          <span className="text-xs font-black px-2.5 py-1 rounded-full bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-purple-100">
            +30 XP ⭐
          </span>
        </div>

        <button
          onClick={onComplete}
          disabled={isEnrolling}
          className="w-full py-4 px-8 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-black text-base shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <span>{isEnrolling ? 'Сохранение в словарь...' : 'Сохранить слова и открыть правило ➔'}</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    );
  }

  // ----------------------------------------------------
  // CHUNK DONE INTERMEDIATE CELEBRATION
  // ----------------------------------------------------
  if (subPhase === 'chunk_done') {
    return (
      <div className="max-w-md mx-auto text-center py-10 space-y-6 animate-fadeIn">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center mx-auto text-3xl shadow-lg animate-pulse">
          ✨
        </div>
        <div>
          <h3 className="text-xl font-black text-gray-900 dark:text-white mb-1">
            Порция {chunkIdx + 1} из {totalChunks} освоена!
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Отлично! Переходим к следующей порции из {chunks[chunkIdx + 1]?.length || 3} слов с интервальным повторением.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onSkipToTheory}
            className="flex-1 py-3 px-5 rounded-2xl border-2 border-purple-200 dark:border-purple-700 bg-white dark:bg-gray-800 text-purple-700 dark:text-purple-300 font-extrabold text-sm hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-all"
          >
            Пропустить к теории ⏩
          </button>
          <button
            onClick={handleNextChunk}
            className="flex-1 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-extrabold text-sm shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <span>Следующая тройка ({chunkIdx + 2}/{totalChunks}) ➔</span>
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // SUBPHASE: Presenting Illustrated Cards in Current Chunk
  // ----------------------------------------------------
  if (subPhase === 'presenting' && currentWord) {
    const overallWordIndex = chunkIdx * CHUNK_SIZE + cardInChunkIdx + 1;
    const progressPercent = Math.round((overallWordIndex / words.length) * 100);

    return (
      <div className="max-w-2xl mx-auto space-y-5 animate-fadeIn">
        {/* Top Indicators */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-xl bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-extrabold text-xs">
              Порция {chunkIdx + 1}/{totalChunks} • Слово {cardInChunkIdx + 1}/{currentChunk.length}
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 hidden sm:inline">
              Знакомство со словами
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onSkipToTheory}
              className="px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-900/40 hover:bg-purple-100 dark:hover:bg-purple-900/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700 font-bold text-xs transition-colors flex items-center gap-1 shadow-sm"
              title="Пропустить вводные слова и перейти сразу к теории"
            >
              <span>Пропустить слова ➔</span>
            </button>
            <button
              onClick={() => {
                setSubPhase('testing');
                setTestIdx(0);
                setTestSelected(null);
              }}
              className="text-xs font-bold text-gray-500 hover:text-purple-600 transition-colors"
            >
              К проверке ⚡
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-100 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
          <div
            className="bg-gradient-to-r from-fuchsia-500 to-purple-600 h-full rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Thematic Illustrated Word Card */}
        <VocabularyWordIllustration
          word={currentWord.word}
          translation={currentWord.translation}
          example={currentWord.example}
          exampleTranslation={currentWord.exampleTranslation}
          partOfSpeech={currentWord.partOfSpeech}
          overallIndex={overallWordIndex}
          totalWords={words.length}
        />

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            onClick={handlePresentationPrev}
            disabled={cardInChunkIdx === 0}
            className="px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold text-sm hover:bg-gray-50 disabled:opacity-30 transition-all flex items-center gap-1.5 shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Назад</span>
          </button>

          <button
            onClick={onSkipToTheory}
            className="px-4 py-3 rounded-2xl border border-purple-200 dark:border-purple-700/60 bg-purple-50/70 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 font-bold text-sm hover:bg-purple-100/70 dark:hover:bg-purple-900/40 transition-all"
            title="Пропустить слова и перейти к теории"
          >
            Пропустить к теории ⏩
          </button>

          <button
            onClick={handlePresentationNext}
            className="flex-1 py-3 px-5 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-extrabold text-sm shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <span>
              {cardInChunkIdx < currentChunk.length - 1
                ? 'Следующее слово'
                : 'Проверить эти 3 слова ⚡'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // SUBPHASE: Testing Current Chunk (with interleaving)
  // ----------------------------------------------------
  if (subPhase === 'testing') {
    const qItem = currentTestItems[testIdx] || currentTestItems[0];
    const visualMeta = getWordVisualMeta(qItem.word, qItem.translation);
    const progressPercent = Math.round(((testIdx + 1) / currentTestItems.length) * 100);

    return (
      <div className="max-w-2xl mx-auto space-y-5 animate-fadeIn">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-amber-100 text-amber-800 font-extrabold text-xs flex items-center justify-center">
              ⚡
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Проверка порции {chunkIdx + 1} ({testIdx + 1}/{currentTestItems.length})
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={onSkipToTheory}
              className="px-3 py-1 rounded-xl bg-purple-50 dark:bg-purple-900/40 hover:bg-purple-100 dark:hover:bg-purple-900/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700 font-bold text-xs transition-colors flex items-center gap-1 shadow-sm"
              title="Пропустить проверку и перейти к теории"
            >
              <span>Пропустить к теории ➔</span>
            </button>
            <span className="text-xs font-bold text-gray-500">
              Счет: {testScore}
            </span>
          </div>
        </div>

        <div className="w-full bg-gray-100 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
          <div
            className="bg-gradient-to-r from-amber-400 to-orange-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className={`p-8 rounded-3xl ${visualMeta.bgCard} border-2 shadow-xl text-center relative overflow-hidden`}>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/90 dark:bg-gray-800/90 shadow-sm text-xs font-bold text-gray-800 dark:text-gray-100 mb-3">
            <span>{visualMeta.emoji}</span>
            <span>Как переводится это выражение?</span>
          </div>

          <div className="flex items-center justify-center gap-3 mb-6">
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white">
              {qItem.word}
            </h2>
            <button
              onClick={() => speakSpanish(qItem.word)}
              className="p-2 rounded-xl bg-white dark:bg-gray-700 text-purple-600 shadow-sm hover:scale-105 transition-transform"
            >
              <Volume2 className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {qItem.options.map((opt, oIdx) => {
              const isSelected = testSelected === opt;
              const isCorrect = opt === qItem.correctOption;

              let btnStyle = 'border-purple-100 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 text-gray-800 dark:text-gray-100 hover:border-purple-300 hover:bg-purple-50/50';
              if (testSelected !== null) {
                if (isCorrect) {
                  btnStyle = 'border-green-500 bg-green-50 dark:bg-green-950/70 text-green-900 dark:text-green-100 font-black';
                } else if (isSelected) {
                  btnStyle = 'border-rose-500 bg-rose-50 dark:bg-rose-950/70 text-rose-900 dark:text-rose-100 font-bold';
                } else {
                  btnStyle = 'opacity-40 border-gray-200 dark:border-gray-700';
                }
              }

              return (
                <button
                  key={oIdx}
                  onClick={() => handleTestSelect(opt)}
                  disabled={testSelected !== null}
                  className={`p-4 rounded-2xl border-2 text-left font-bold text-sm transition-all flex items-center justify-between shadow-sm active:scale-98 ${btnStyle}`}
                >
                  <span>{opt}</span>
                  {testSelected !== null && isCorrect && (
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  )}
                  {testSelected !== null && isSelected && !isCorrect && (
                    <XCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
