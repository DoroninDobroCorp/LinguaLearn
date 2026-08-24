import React, { useState } from 'react';
import { Volume2, Keyboard, Zap, Tag, Check, Star } from 'lucide-react';
import { speakEnglish, soundEngine } from '../../utils/soundEffects';
import { scoreTypedAnswer } from '../../utils/answerMatching';

export default function VocabularyStudyCard({
  currentWord,
  studyMode,
  studyQueue,
  roundLap,
  roundTotal,
  completed,
  groups,
  isCurrentGroupRound,
  pendingReviewCount,
  quizOptions,
  onReview,
  onToggleFavorite,
  onToggleLearned,
  onStartRound
}) {
  const [practiceStyle, setPracticeStyle] = useState('flip');
  const [practiceDirection, setPracticeDirection] = useState('en_to_ru');
  const [showTranslation, setShowTranslation] = useState(false);
  const [typedInput, setTypedInput] = useState('');
  const [typedResult, setTypedResult] = useState(null);
  const [selectedQuizOption, setSelectedQuizOption] = useState(null);

  if (!currentWord) return null;

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <p className="text-sm font-semibold text-indigo-600 flex items-center gap-2">
            <span>{studyMode}</span>
            {isCurrentGroupRound && (
              <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-xs font-bold">
                Lap {roundLap} (infinite loop)
              </span>
            )}
            <span>· {completed + 1} of {roundTotal}</span>
          </p>
          <p className="text-xs text-slate-500">
            {studyQueue.length} remaining
            {pendingReviewCount > 0 ? ` · Saving ${pendingReviewCount} answer${pendingReviewCount === 1 ? '' : 's'}…` : ''}
          </p>
        </div>

        {/* Word Groups Badges on Card */}
        <div className="flex items-center gap-2">
          {(currentWord.groups || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(currentWord.groups || []).map((g) => (
                <span key={g.id} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold">
                  <Tag className="h-3 w-3" />
                  {g.name}
                </span>
              ))}
            </div>
          )}
          {isCurrentGroupRound && (
            <button
              type="button"
              onClick={() => onStartRound('due')}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors shadow-sm"
              title="Stop group practice and return to due words"
            >
              <span>🛑 Stop practice</span>
            </button>
          )}
        </div>
      </div>

      {/* Mode & Direction Selector Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 mb-5">
        <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-200 text-xs font-bold">
          <button
            type="button"
            onClick={() => { setPracticeStyle('flip'); setShowTranslation(false); setTypedResult(null); }}
            className={`px-3 py-1.5 rounded-md transition-all ${
              practiceStyle === 'flip' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🎴 Карточки
          </button>
          <button
            type="button"
            onClick={() => { setPracticeStyle('typing'); setShowTranslation(false); setTypedInput(''); setTypedResult(null); }}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1 ${
              practiceStyle === 'typing' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Keyboard className="h-3.5 w-3.5" />
            <span>Ввод слова</span>
          </button>
          <button
            type="button"
            onClick={() => { setPracticeStyle('quiz'); setShowTranslation(false); setSelectedQuizOption(null); }}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1 ${
              practiceStyle === 'quiz' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            <span>Тест 1 из 4</span>
          </button>
        </div>

        <div className="flex items-center gap-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => { setPracticeDirection('en_to_ru'); setShowTranslation(false); setTypedResult(null); }}
            className={`px-2.5 py-1.5 rounded-lg border transition-all ${
              practiceDirection === 'en_to_ru'
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                : 'bg-white border-slate-200 text-slate-600'
            }`}
          >
            🇬🇧 EN → 🇷🇺 RU
          </button>
          <button
            type="button"
            onClick={() => { setPracticeDirection('ru_to_en'); setShowTranslation(false); setTypedResult(null); }}
            className={`px-2.5 py-1.5 rounded-lg border transition-all ${
              practiceDirection === 'ru_to_en'
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                : 'bg-white border-slate-200 text-slate-600'
            }`}
          >
            🇷🇺 RU → 🇬🇧 EN
          </button>
        </div>
      </div>

      {/* Interactive Study Card */}
      {practiceStyle === 'flip' ? (
        <div
          onClick={() => setShowTranslation((v) => !v)}
          className="bg-gradient-to-br from-indigo-50/70 to-purple-50/70 rounded-2xl p-10 min-h-[240px] flex flex-col items-center justify-center cursor-pointer border-2 border-indigo-200 hover:border-indigo-300 transition-colors select-none text-center relative"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              speakEnglish(currentWord.word);
            }}
            className="absolute top-4 right-4 p-2 rounded-xl bg-white/80 hover:bg-white text-indigo-600 shadow-sm transition-all"
            title="Озвучить"
          >
            <Volume2 className="h-5 w-5" />
          </button>
          <p className="text-4xl sm:text-5xl font-bold text-indigo-950 mb-4">
            {practiceDirection === 'en_to_ru' ? currentWord.word : currentWord.translation}
          </p>
          {showTranslation ? (
            <div className="animate-fade-in space-y-2">
              <p className="text-2xl sm:text-3xl font-semibold text-purple-900">
                {practiceDirection === 'en_to_ru' ? currentWord.translation : currentWord.word}
              </p>
              {currentWord.example && (
                <p className="text-base text-slate-600 italic mt-2 max-w-lg">“{currentWord.example}”</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500 font-medium">Нажмите на карточку, чтобы перевернуть</p>
          )}
        </div>
      ) : practiceStyle === 'typing' ? (
        <div className="bg-gradient-to-br from-indigo-50/70 to-purple-50/70 rounded-2xl p-8 min-h-[240px] flex flex-col items-center justify-center border-2 border-indigo-200 text-center space-y-4 relative">
          <button
            type="button"
            onClick={() => speakEnglish(currentWord.word)}
            className="absolute top-4 right-4 p-2 rounded-xl bg-white/80 hover:bg-white text-indigo-600 shadow-sm"
            title="Озвучить"
          >
            <Volume2 className="h-5 w-5" />
          </button>

          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Напишите перевод:</span>
            <p className="text-3xl sm:text-4xl font-bold text-indigo-950">
              {practiceDirection === 'en_to_ru' ? currentWord.word : currentWord.translation}
            </p>
          </div>

          <div className="w-full max-w-md space-y-2">
            <input
              type="text"
              value={typedInput}
              onChange={(e) => setTypedInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const expected = practiceDirection === 'en_to_ru' ? currentWord.translation : currentWord.word;
                  const res = scoreTypedAnswer(typedInput, expected);
                  setTypedResult(res);
                  setShowTranslation(true);
                  if (res.status === 'correct' || res.status === 'close') soundEngine.playCorrect();
                  else soundEngine.playWrong();
                }
              }}
              placeholder={practiceDirection === 'en_to_ru' ? 'Введите перевод на русском...' : 'Type in English...'}
              className="w-full px-4 py-3 rounded-xl border-2 border-indigo-300 focus:border-indigo-600 text-center font-bold text-lg outline-none bg-white"
            />

            {!typedResult && (
              <button
                type="button"
                onClick={() => {
                  const expected = practiceDirection === 'en_to_ru' ? currentWord.translation : currentWord.word;
                  const res = scoreTypedAnswer(typedInput, expected);
                  setTypedResult(res);
                  setShowTranslation(true);
                  if (res.status === 'correct' || res.status === 'close') soundEngine.playCorrect();
                  else soundEngine.playWrong();
                }}
                disabled={!typedInput.trim()}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition-all"
              >
                Проверить ответ ↵
              </button>
            )}
          </div>

          {typedResult && (
            <div className={`p-3 rounded-xl border text-sm font-bold animate-fade-in ${
              typedResult.status === 'correct'
                ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                : typedResult.status === 'close'
                ? 'bg-amber-50 border-amber-400 text-amber-800'
                : 'bg-rose-50 border-rose-400 text-rose-800'
            }`}>
              {typedResult.status === 'correct' ? (
                <span>✅ Идеально верно!</span>
              ) : typedResult.status === 'close' ? (
                <span>⚠️ Почти точно (опечатка). Правильно: {practiceDirection === 'en_to_ru' ? currentWord.translation : currentWord.word}</span>
              ) : (
                <span>❌ Неверно. Правильно: {practiceDirection === 'en_to_ru' ? currentWord.translation : currentWord.word}</span>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Quiz Mode (1 of 4) */
        <div className="bg-gradient-to-br from-indigo-50/70 to-purple-50/70 rounded-2xl p-8 min-h-[240px] flex flex-col items-center justify-center border-2 border-indigo-200 text-center space-y-5 relative">
          <button
            type="button"
            onClick={() => speakEnglish(currentWord.word)}
            className="absolute top-4 right-4 p-2 rounded-xl bg-white/80 hover:bg-white text-indigo-600 shadow-sm"
            title="Озвучить"
          >
            <Volume2 className="h-5 w-5" />
          </button>

          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Выберите правильный вариант:</span>
            <p className="text-3xl sm:text-4xl font-bold text-indigo-950">
              {practiceDirection === 'en_to_ru' ? currentWord.word : currentWord.translation}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
            {quizOptions.map((opt, idx) => {
              const expected = practiceDirection === 'en_to_ru' ? currentWord.translation : currentWord.word;
              const isSelected = selectedQuizOption === opt;
              let btnStyle = 'bg-white border-slate-200 hover:border-indigo-400 text-slate-800';

              if (selectedQuizOption) {
                if (opt === expected) {
                  btnStyle = 'bg-emerald-50 border-emerald-500 text-emerald-900 font-bold';
                } else if (isSelected) {
                  btnStyle = 'bg-rose-50 border-rose-500 text-rose-900';
                } else {
                  btnStyle = 'opacity-40 border-slate-200';
                }
              }

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    if (selectedQuizOption) return;
                    setSelectedQuizOption(opt);
                    setShowTranslation(true);
                    if (opt === expected) soundEngine.playCorrect();
                    else soundEngine.playWrong();
                  }}
                  className={`p-3.5 rounded-xl border-2 text-center font-bold text-sm sm:text-base transition-all shadow-sm ${btnStyle}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Actions (Favorite & Learned) */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-4 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleFavorite(currentWord)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
              currentWord.is_favorite
                ? 'bg-amber-50 border-amber-300 text-amber-700'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-amber-300'
            }`}
          >
            <Star className={`h-4 w-4 ${currentWord.is_favorite ? 'fill-amber-400 text-amber-500' : ''}`} />
            <span>{currentWord.is_favorite ? 'In Favorites' : 'Add to Favorites'}</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleLearned(currentWord)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
              currentWord.learned_permanently_at
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-emerald-300'
            }`}
          >
            <Check className="h-4 w-4" />
            <span>{currentWord.learned_permanently_at ? 'Learned' : 'Mark Learned'}</span>
          </button>
        </div>

        {/* SM-2 Review Rating Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => {
              onReview(1);
              setShowTranslation(false);
              setTypedResult(null);
              setTypedInput('');
              setSelectedQuizOption(null);
            }}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
          >
            Again (1)
          </button>
          <button
            type="button"
            onClick={() => {
              onReview(2);
              setShowTranslation(false);
              setTypedResult(null);
              setTypedInput('');
              setSelectedQuizOption(null);
            }}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors"
          >
            Hard (2)
          </button>
          <button
            type="button"
            onClick={() => {
              onReview(3);
              setShowTranslation(false);
              setTypedResult(null);
              setTypedInput('');
              setSelectedQuizOption(null);
            }}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors"
          >
            Good (3)
          </button>
          <button
            type="button"
            onClick={() => {
              onReview(4);
              setShowTranslation(false);
              setTypedResult(null);
              setTypedInput('');
              setSelectedQuizOption(null);
            }}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
          >
            Easy (4)
          </button>
        </div>
      </div>
    </div>
  );
}
