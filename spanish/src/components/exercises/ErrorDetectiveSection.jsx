import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, WifiOff } from 'lucide-react';
import { profileApiUrl, profileFetch } from '../../utils/api';
import { soundEngine } from '../../utils/soundEffects';
import { getErrorDetectiveBatch, verifyErrorDetective } from '../../utils/gameExercises';

export default function ErrorDetectiveSection() {
  const [items, setItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedFix, setSelectedFix] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [ruleExplanation, setRuleExplanation] = useState('');
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  const fetchItems = async () => {
    let loadedList = [];
    try {
      setLoading(true);
      const res = await profileFetch(profileApiUrl('/spanish/api/exercises/error-detective')).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items) && data.items.length > 0) {
          loadedList = data.items;
        }
      }
    } catch (err) {
      console.warn('Network error fetching error detective, using offline presets:', err);
    }

    if (loadedList.length === 0) {
      loadedList = getErrorDetectiveBatch();
      setIsOffline(true);
    }

    setItems(loadedList);
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const currentItem = items[currentIndex] || getErrorDetectiveBatch()[0];

  const handleSelectOption = async (option) => {
    if (isSubmitted || !currentItem) return;
    setSelectedFix(option);
    soundEngine.playTileClick();

    let verification = null;
    try {
      const res = await profileFetch(profileApiUrl('/spanish/api/exercises/error-detective/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: currentItem.id, chosenOption: option })
      });

      if (res && res.ok) {
        verification = await res.json();
      }
    } catch (err) {
      // offline
    }

    if (!verification) {
      verification = verifyErrorDetective(currentItem.id, option);
    }

    setIsSubmitted(true);
    setRuleExplanation(verification.ruleExplanation || currentItem.ruleExplanation || '');
    if (verification.isCorrect) soundEngine.playCorrect();
    else soundEngine.playWrong();

    // Record / resolve mistake in grammar memory (background/silent)
    try {
      if (!verification.isCorrect) {
        profileFetch(profileApiUrl('/spanish/api/exercises/record-mistake'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicName: currentItem.testedGrammar || 'Error Detective',
            category: 'error_detective',
            level: currentItem.level || 'A1',
            prompt: currentItem.sentence,
            userWrongAnswer: option,
            correctAnswer: currentItem.correctWord || verification.correctWord || '',
            ruleExplanation: verification.ruleExplanation || currentItem.ruleExplanation || ''
          })
        }).catch(() => {});
      } else {
        profileFetch(profileApiUrl('/spanish/api/exercises/resolve-mistake'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: 'error_detective',
            prompt: currentItem.sentence
          })
        }).catch(() => {});
      }
    } catch (e) {
      console.warn('Mistake tracking error in ErrorDetective:', e);
    }
  };

  const handleNext = () => {
    const nextIdx = (currentIndex + 1) % items.length;
    setCurrentIndex(nextIdx);
    setSelectedFix(null);
    setIsSubmitted(false);
    setRuleExplanation('');
  };

  if (loading && !currentItem) {
    return <div className="p-8 text-center text-gray-500">Загрузка детектора ошибок...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto glass-card rounded-3xl p-6 sm:p-10 shadow-2xl border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 animate-fadeIn space-y-6">
      <div className="flex items-center justify-between border-b border-purple-100 dark:border-gray-700 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 px-2.5 py-1 rounded-full">
              {currentItem.level || 'A1'}
            </span>
            {isOffline && (
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                <WifiOff className="w-3 h-3" /> Офлайн
              </span>
            )}
          </div>
          <h3 className="text-xl font-extrabold text-gray-900 dark:text-white mt-1">
            🔍 Детектив грамматических ошибок
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Найдите и выберите правильное исправление ошибки в предложении.</p>
        </div>
        <span className="text-sm font-bold text-purple-600 dark:text-purple-400">{currentIndex + 1} / {items.length}</span>
      </div>

      <div className="p-6 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/40 dark:to-pink-950/40 border border-purple-200 dark:border-purple-800">
        <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">Предложение с ошибкой:</span>
        <p className="text-lg font-semibold text-gray-900 dark:text-white leading-relaxed mt-1">
          {currentItem.sentence}
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Какой вариант исправления правильный?
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(currentItem.options || []).map((opt, idx) => {
            let btnStyle = 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-purple-400 text-gray-800 dark:text-gray-200';
            if (isSubmitted) {
              if (opt === currentItem.correctWord) {
                btnStyle = 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-900 dark:text-emerald-300 font-bold';
              } else if (opt === selectedFix) {
                btnStyle = 'bg-rose-50 dark:bg-rose-950/50 border-rose-500 text-rose-900 dark:text-rose-300';
              } else {
                btnStyle = 'opacity-40 border-gray-200 dark:border-gray-600';
              }
            }

            return (
              <button
                key={idx}
                onClick={() => handleSelectOption(opt)}
                disabled={isSubmitted}
                className={`p-4 text-left rounded-xl border-2 font-semibold text-sm transition-all shadow-sm active:scale-95 ${btnStyle}`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {isSubmitted && (
        <div className="p-5 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 space-y-1 animate-fadeIn">
          <div className="font-bold text-sm text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            Объяснение правила:
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{ruleExplanation}</p>
        </div>
      )}

      {isSubmitted && (
        <div className="flex justify-end pt-2">
          <button
            onClick={handleNext}
            className="px-6 py-3 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold rounded-xl shadow-lg text-sm flex items-center gap-2"
          >
            <span>Следующее задание</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
