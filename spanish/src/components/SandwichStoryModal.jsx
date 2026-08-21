import React, { useState } from 'react';
import {
  X, Volume2, Sparkles, CheckCircle2, XCircle, ArrowRight,
  HelpCircle, BookOpen, Trophy, Compass, Star
} from 'lucide-react';
import { profileApiUrl, profileFetch } from '../utils/api';
import { soundEngine, speakSpanish } from '../utils/soundEffects';
import MateoCharacter from './MateoCharacter';

export default function SandwichStoryModal({ chapter, isOpen, onClose, onChapterFinished, isCompleted }) {
  const [selectedOpt, setSelectedOpt] = useState(null);
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [savingProgress, setSavingProgress] = useState(false);
  const [correctOpt, setCorrectOpt] = useState(null);
  const [isCorrect, setIsCorrect] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen || !chapter) return null;

  const handleQuizAnswer = async (optIdx) => {
    if (savingProgress || (quizAnswered && isCorrect)) return;
    setSelectedOpt(optIdx);
    setSavingProgress(true);
    setErrorMessage('');
    try {
      const eventId = `web-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
      const res = await profileFetch(profileApiUrl('/spanish/api/sandwich-story/progress'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId: chapter.id, answerIndex: optIdx, eventId }),
      });
      const data = await res.json();
      setQuizAnswered(true);
      setCorrectOpt(data.correctIndex);
      setIsCorrect(Boolean(data.isCorrect));
      setExplanation(data.explanation || '');
      if (data.isCorrect) {
        soundEngine.playCorrect();
        if (onChapterFinished) onChapterFinished(chapter.id);
      } else {
        soundEngine.playWrong();
      }
    } catch (err) {
      setErrorMessage('Не удалось проверить ответ. Попробуйте ещё раз.');
    } finally {
      setSavingProgress(false);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-gray-850 rounded-3xl max-w-3xl w-full max-h-[90vh] shadow-2xl border border-purple-100 dark:border-gray-700 flex flex-col overflow-hidden relative">
        {/* Header */}
        <div className="px-6 py-4 border-b border-purple-100 dark:border-gray-700 flex items-center justify-between bg-gradient-to-r from-amber-50 via-purple-50 to-pink-50 dark:from-gray-800 dark:to-gray-750">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-xl shadow-md text-white">
              📖
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-gray-900 dark:text-white">
                {chapter.titleRu}
              </h2>
              <div className="flex items-center space-x-2 text-xs text-purple-600 dark:text-purple-400 font-semibold">
                <span>📍 {chapter.landmark}</span>
                {isCompleted && (
                  <span className="bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full flex items-center gap-1 font-bold">
                    <CheckCircle2 className="w-3 h-3" />
                    Освоено
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
          {/* Character Guide Bubble */}
          <div className="p-4 rounded-3xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
            <MateoCharacter
              mood="happy"
              speechText={`В этой главе мы осваиваем: «${chapter.grammarFocus}». Обрати внимание на выделенные испанские фразы!`}
              size="sm"
            />
          </div>

          {/* Vocabulary Highlight Pills */}
          <div>
            <div className="text-xs font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Ключевые слова главы (нажми, чтобы услышать):
            </div>
            <div className="flex flex-wrap gap-2">
              {chapter.vocabHighlights.map((v, vIdx) => (
                <button
                  key={vIdx}
                  onClick={() => {
                    soundEngine.playTileClick();
                    speakSpanish(v.audio);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-gray-750 hover:bg-purple-100 dark:hover:bg-gray-700 border border-purple-200 dark:border-purple-800 text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5 transition-transform active:scale-95 shadow-sm"
                >
                  <span className="text-purple-600 dark:text-purple-400">{v.es}</span>
                  <span className="text-gray-400 dark:text-gray-500 font-normal">({v.ru})</span>
                  <Volume2 className="w-3.5 h-3.5 text-purple-500" />
                </button>
              ))}
            </div>
          </div>

          {/* Story Paragraphs with Sandwich Immersion */}
          <div className="space-y-4 text-sm sm:text-base leading-relaxed text-gray-800 dark:text-gray-200 bg-white/60 dark:bg-gray-800/60 p-6 rounded-3xl border border-purple-50 dark:border-gray-700 shadow-inner">
            {chapter.paragraphs.map((p, pIdx) => (
              <div key={pIdx} className="space-y-2">
                <p>{p.textRu}</p>

                {p.spanishPhrase && (
                  <div className="p-3 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 flex items-center justify-between gap-3 text-purple-900 dark:text-purple-200 font-semibold text-sm sm:text-base">
                    <div>
                      <div>{p.spanishPhrase}</div>
                      {p.translationRu && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-normal mt-0.5">
                          {p.translationRu}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => speakSpanish(p.spanishPhrase.replace(/^[—\s-]+/, ''))}
                      className="p-2 text-purple-600 hover:bg-purple-200 dark:hover:bg-purple-900 rounded-full transition-colors flex-shrink-0"
                      title="Прослушать"
                    >
                      <Volume2 className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Quick Chapter Verification Quiz */}
          {chapter.quickQuiz && (
            <div className="pt-4 border-t border-purple-100 dark:border-gray-700 space-y-3">
              <h3 className="text-sm font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-fuchsia-500" />
                Вопрос для закрепления главы (+50 XP):
              </h3>
              <p className="text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-200">
                {chapter.quickQuiz.question}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {chapter.quickQuiz.options.map((opt, optIdx) => {
                  let btnClass = 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:border-purple-400';
                  if (quizAnswered) {
                    if (optIdx === correctOpt) {
                      btnClass = 'bg-green-100 dark:bg-green-900/60 border-green-500 text-green-900 dark:text-green-200 font-bold';
                    } else if (optIdx === selectedOpt) {
                      btnClass = 'bg-red-100 dark:bg-red-900/60 border-red-500 text-red-900 dark:text-red-200';
                    } else {
                      btnClass = 'opacity-40';
                    }
                  }

                  return (
                    <button
                      key={optIdx}
                      onClick={() => handleQuizAnswer(optIdx)}
                      disabled={savingProgress || (quizAnswered && isCorrect)}
                      className={`p-3 text-left rounded-xl border text-xs font-semibold transition-all ${btnClass}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>

              {quizAnswered && (
                <div className="mt-3 p-3 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/40 dark:to-pink-950/40 border border-purple-200 dark:border-purple-800 text-xs text-purple-900 dark:text-purple-200 font-semibold flex items-center justify-between">
                  <div>💡 {explanation || (isCorrect ? 'Верно!' : 'Посмотрите ответ и попробуйте ещё раз.')}</div>
                  <span className="font-extrabold text-amber-500">{isCorrect ? '+50 XP!' : 'Ещё попытка'}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-purple-100 dark:border-gray-700 flex items-center justify-between bg-gray-50/80 dark:bg-gray-800/80">
          <button
            onClick={onClose}
            className="px-5 py-2 text-gray-600 dark:text-gray-300 font-bold text-xs sm:text-sm hover:underline"
          >
            Закрыть
          </button>

          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 text-xs sm:text-sm flex items-center gap-1.5"
          >
            <span>Готово</span>
            <CheckCircle2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
