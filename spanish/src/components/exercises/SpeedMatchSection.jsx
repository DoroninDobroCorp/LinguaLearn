import React, { useState, useEffect } from 'react';
import { Zap, Clock } from 'lucide-react';
import { profileApiUrl, profileFetch } from '../../utils/api';
import { soundEngine } from '../../utils/soundEffects';

export default function SpeedMatchSection() {
  const [pairs, setPairs] = useState([]);
  const [esCards, setEsCards] = useState([]);
  const [ruCards, setRuCards] = useState([]);
  const [selectedEs, setSelectedEs] = useState(null);
  const [selectedRu, setSelectedRu] = useState(null);
  const [matchedIds, setMatchedIds] = useState(new Set());
  const [timeLeft, setTimeLeft] = useState(30);
  const [combo, setCombo] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [score, setScore] = useState(0);

  const startRound = async () => {
    try {
      const res = await profileFetch(profileApiUrl('/spanish/api/exercises/speed-match'));
      if (res.ok) {
        const data = await res.json();
        const rawPairs = data.pairs || [];
        setPairs(rawPairs);

        const esList = rawPairs.map((p, i) => ({ id: i, text: p.left })).sort(() => 0.5 - Math.random());
        const ruList = rawPairs.map((p, i) => ({ id: i, text: p.right })).sort(() => 0.5 - Math.random());

        setEsCards(esList);
        setRuCards(ruList);
        setMatchedIds(new Set());
        setSelectedEs(null);
        setSelectedRu(null);
        setTimeLeft(30);
        setCombo(1);
        setScore(0);
        setIsPlaying(true);
        setIsGameOver(false);
      }
    } catch (err) {
      console.error('Error starting speed match:', err);
    }
  };

  useEffect(() => {
    let timer;
    if (isPlaying && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(tVal => {
          if (tVal <= 1) {
            setIsPlaying(false);
            setIsGameOver(true);
            soundEngine.playWrong();
            return 0;
          }
          return tVal - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isPlaying, timeLeft]);

  const handleCardClick = (type, card) => {
    if (!isPlaying || matchedIds.has(card.id)) return;
    soundEngine.playTileClick();

    if (type === 'es') {
      if (selectedRu) {
        if (selectedRu.id === card.id) {
          soundEngine.playCombo(combo);
          const nextMatched = new Set(matchedIds);
          nextMatched.add(card.id);
          setMatchedIds(nextMatched);
          setScore(s => s + (10 * combo));
          setCombo(c => c + 1);
          setSelectedEs(null);
          setSelectedRu(null);

          if (nextMatched.size === pairs.length) {
            setIsPlaying(false);
            setIsGameOver(true);
            soundEngine.playVictory();
          }
        } else {
          soundEngine.playWrong();
          setCombo(1);
          setSelectedEs(null);
          setSelectedRu(null);
        }
      } else {
        setSelectedEs(card);
      }
    } else {
      if (selectedEs) {
        if (selectedEs.id === card.id) {
          soundEngine.playCombo(combo);
          const nextMatched = new Set(matchedIds);
          nextMatched.add(card.id);
          setMatchedIds(nextMatched);
          setScore(s => s + (10 * combo));
          setCombo(c => c + 1);
          setSelectedEs(null);
          setSelectedRu(null);

          if (nextMatched.size === pairs.length) {
            setIsPlaying(false);
            setIsGameOver(true);
            soundEngine.playVictory();
          }
        } else {
          soundEngine.playWrong();
          setCombo(1);
          setSelectedEs(null);
          setSelectedRu(null);
        }
      } else {
        setSelectedRu(card);
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto glass-card rounded-3xl p-6 sm:p-10 shadow-2xl border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 animate-fadeIn space-y-6">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-purple-100 dark:border-gray-700">
        <div>
          <h3 className="text-xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-500" />
            Speed Match Blitz
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Сопоставляйте пары слов до истечения 30 секунд.</p>
        </div>

        {isPlaying && (
          <div className="flex items-center space-x-4">
            <div className="px-3 py-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white font-extrabold text-sm rounded-full shadow animate-pulse">
              Combo x{combo} 🔥
            </div>
            <div className="flex items-center space-x-1.5 font-mono text-lg font-bold text-purple-600 dark:text-purple-400">
              <Clock className="w-5 h-5" />
              <span>{timeLeft}s</span>
            </div>
          </div>
        )}
      </div>

      {!isPlaying && !isGameOver && (
        <div className="text-center py-12 space-y-4">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center mx-auto text-4xl shadow-xl">
            ⚡
          </div>
          <h4 className="text-2xl font-extrabold text-gray-900 dark:text-white">Готовы к спринту на скорость?</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
            У вас есть 30 секунд, чтобы найти все 6 пар. Держите комбо для максимального счета!
          </p>
          <button
            onClick={startRound}
            className="px-8 py-3.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-extrabold text-base rounded-2xl shadow-xl transition-transform active:scale-95"
          >
            Начать раунд 🚀
          </button>
        </div>
      )}

      {isPlaying && (
        <div className="grid grid-cols-2 gap-4 sm:gap-6 my-6">
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 text-center">🇪🇸 Español</div>
            {esCards.map((card) => {
              const isMatched = matchedIds.has(card.id);
              const isSelected = selectedEs?.id === card.id;
              if (isMatched) return <div key={card.id} className="h-14 opacity-0 pointer-events-none" />;

              return (
                <button
                  key={card.id}
                  onClick={() => handleCardClick('es', card)}
                  className={`w-full h-14 px-4 rounded-2xl font-bold text-sm sm:text-base border-2 shadow-sm transition-all flex items-center justify-center text-center ${
                    isSelected ? 'bg-purple-600 text-white border-purple-600 scale-105' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:border-purple-400'
                  }`}
                >
                  {card.text}
                </button>
              );
            })}
          </div>

          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 text-center">🇷🇺 Русский</div>
            {ruCards.map((card) => {
              const isMatched = matchedIds.has(card.id);
              const isSelected = selectedRu?.id === card.id;
              if (isMatched) return <div key={card.id} className="h-14 opacity-0 pointer-events-none" />;

              return (
                <button
                  key={card.id}
                  onClick={() => handleCardClick('ru', card)}
                  className={`w-full h-14 px-4 rounded-2xl font-bold text-sm sm:text-base border-2 shadow-sm transition-all flex items-center justify-center text-center ${
                    isSelected ? 'bg-indigo-600 text-white border-indigo-600 scale-105' : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:border-indigo-400'
                  }`}
                >
                  {card.text}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isGameOver && (
        <div className="text-center py-8 space-y-4 animate-fadeIn">
          <h4 className="text-2xl font-black text-gray-900 dark:text-white">Раунд завершен!</h4>
          <p className="text-lg font-bold text-purple-600 dark:text-purple-400">Набрано очков: {score}</p>
          <button
            onClick={startRound}
            className="px-6 py-3 bg-purple-600 text-white font-bold rounded-xl shadow-md"
          >
            Сыграть еще раз 🔄
          </button>
        </div>
      )}
    </div>
  );
}
