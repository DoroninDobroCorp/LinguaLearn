import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { soundEngine } from '../../utils/soundEffects';

export default function ErrorDetectiveSection() {
  const [items, setItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedFix, setSelectedFix] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [ruleExplanation, setRuleExplanation] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await fetch('/english/api/exercises/error-detective');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Error fetching error detective:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const currentItem = items[currentIndex];

  const handleSelectOption = async (option) => {
    if (isSubmitted || !currentItem) return;
    setSelectedFix(option);
    soundEngine.playTileClick();

    try {
      const res = await fetch('/english/api/exercises/error-detective/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: currentItem.id, chosenOption: option })
      });

      if (res.ok) {
        const data = await res.json();
        setIsSubmitted(true);
        setRuleExplanation(data.ruleExplanation);
        if (data.isCorrect) soundEngine.playCorrect();
        else soundEngine.playWrong();
      }
    } catch (err) {
      console.error('Error verifying error detective:', err);
    }
  };

  const handleNext = () => {
    const nextIdx = (currentIndex + 1) % items.length;
    setCurrentIndex(nextIdx);
    setSelectedFix(null);
    setIsSubmitted(false);
    setRuleExplanation('');
  };

  if (loading || !currentItem) {
    return <div className="p-8 text-center text-gray-500">Загрузка детектора ошибок...</div>;
  }

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-xl border border-gray-100 space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div>
          <span className="text-xs font-bold bg-purple-100 text-purple-800 px-2.5 py-1 rounded-full">
            {currentItem.level}
          </span>
          <h3 className="text-xl font-extrabold text-gray-900 mt-1">
            🔍 Детектив грамматических ошибок
          </h3>
          <p className="text-xs text-gray-500">Найдите и выберите правильное исправление ошибки в предложении.</p>
        </div>
        <span className="text-sm font-bold text-purple-600">{currentIndex + 1} / {items.length}</span>
      </div>

      <div className="p-6 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200">
        <span className="text-xs font-bold uppercase tracking-wider text-purple-700">Предложение с ошибкой:</span>
        <p className="text-lg font-semibold text-gray-900 leading-relaxed mt-1">
          {currentItem.sentence}
        </p>
      </div>

      <div className="space-y-3">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Какой вариант исправления правильный?
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {currentItem.options.map((opt, idx) => {
            let btnStyle = 'bg-white border-gray-200 hover:border-purple-400 text-gray-800';
            if (isSubmitted) {
              if (opt === currentItem.correctWord) {
                btnStyle = 'bg-emerald-50 border-emerald-500 text-emerald-900 font-bold';
              } else if (opt === selectedFix) {
                btnStyle = 'bg-rose-50 border-rose-500 text-rose-900';
              } else {
                btnStyle = 'opacity-40 border-gray-200';
              }
            }

            return (
              <button
                key={idx}
                onClick={() => handleSelectOption(opt)}
                disabled={isSubmitted}
                className={`p-4 text-left rounded-xl border-2 font-semibold text-sm transition-all shadow-sm ${btnStyle}`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {isSubmitted && (
        <div className="p-5 rounded-2xl bg-purple-50 border border-purple-200 space-y-1 animate-fadeIn">
          <div className="font-bold text-sm text-purple-900 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-purple-600" />
            Объяснение правила:
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{ruleExplanation}</p>
        </div>
      )}

      {isSubmitted && (
        <div className="flex justify-end pt-2">
          <button
            onClick={handleNext}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-xl shadow-lg text-sm flex items-center gap-2"
          >
            <span>Следующее задание</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
