import React, { useState, useEffect, useRef } from 'react';
import {
  Brain, Target, RefreshCw, CheckCircle, XCircle, Award,
  TrendingUp, Play, RotateCcw, HelpCircle, Flame, Layers,
  Infinity as InfinityIcon, Globe, Check, Search, Filter, ShieldCheck,
  Sparkles, Zap, Puzzle, Clock, CheckCircle2, Volume2, ArrowRight,
  BookOpen, Edit3, HelpCircle as HelpIcon
} from 'lucide-react';
import { profileApiUrl, profileFetch } from '../utils/api';
import { soundEngine, speakSpanish } from '../utils/soundEffects';
import { useLanguage } from '../contexts/LanguageContext';
import {
  createVerbDrillQuestion,
  DRILL_PRONOUN_MODES,
  DRILL_RUN_MODES,
  DRILL_TYPES,
  getVerbDrillDisplayAnswer,
  getVerbDrillProgressTopic,
  isVerbDrillAnswerCorrect,
  isVerbDrillFinished,
} from '../utils/verbDrills';

// Clean text for flexible comparison
function normalizeSentence(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[¿?¡!.,;:«»"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function checkGrammarAnswerMatch(userText, correctText, altAnswers = []) {
  const normUser = normalizeSentence(userText);
  const normCorrect = normalizeSentence(correctText);
  if (normUser === normCorrect) return true;

  if (Array.isArray(altAnswers)) {
    for (const alt of altAnswers) {
      if (normalizeSentence(alt) === normUser) return true;
    }
  }

  const stripAccents = str => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (stripAccents(normUser) === stripAccents(normCorrect)) return true;
  if (Array.isArray(altAnswers)) {
    for (const alt of altAnswers) {
      if (stripAccents(normalizeSentence(alt)) === stripAccents(normUser)) return true;
    }
  }

  return false;
}

// ----------------------------------------------------
// 1. WORD TILES (CONSTRUCTOR DE FRASES)
// ----------------------------------------------------
function WordTilesSection() {
  const { t } = useLanguage();
  const [items, setItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedTiles, setSelectedTiles] = useState([]);
  const [availableTiles, setAvailableTiles] = useState([]);
  const [showHint, setShowHint] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await profileFetch(profileApiUrl('/spanish/api/exercises/word-tiles'));
      if (res.ok) {
        const data = await res.json();
        const list = data.items || [];
        setItems(list);
        if (list.length > 0) loadQuestion(list[0]);
      }
    } catch (err) {
      console.error('Error fetching word tiles:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadQuestion = (item) => {
    const shuffled = [...item.tiles].map((tText, idx) => ({ id: `${idx}_${tText}`, text: tText })).sort(() => 0.5 - Math.random());
    setAvailableTiles(shuffled);
    setSelectedTiles([]);
    setShowHint(false);
    setIsSubmitted(false);
    setIsCorrect(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const currentItem = items[currentIndex];

  const handleTileClick = (tile) => {
    if (isSubmitted) return;
    soundEngine.playTileClick();
    setAvailableTiles(prev => prev.filter(t => t.id !== tile.id));
    setSelectedTiles(prev => [...prev, tile]);
  };

  const handleRemoveTile = (tile) => {
    if (isSubmitted) return;
    soundEngine.playTileClick();
    setSelectedTiles(prev => prev.filter(t => t.id !== tile.id));
    setAvailableTiles(prev => [...prev, tile]);
  };

  const handleVerify = async () => {
    if (isSubmitted || selectedTiles.length === 0 || !currentItem) return;
    const userSentence = selectedTiles.map(t => t.text).join(' ');

    try {
      const res = await profileFetch(profileApiUrl('/spanish/api/exercises/word-tiles/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: currentItem.id, userSentence })
      });

      if (res.ok) {
        const data = await res.json();
        setIsSubmitted(true);
        setIsCorrect(data.isCorrect);
        if (data.isCorrect) soundEngine.playCorrect();
        else soundEngine.playWrong();
      }
    } catch (err) {
      console.error('Error verifying word tiles:', err);
    }
  };

  const handleNext = () => {
    const nextIdx = (currentIndex + 1) % items.length;
    setCurrentIndex(nextIdx);
    loadQuestion(items[nextIdx]);
  };

  if (loading || !currentItem) {
    return <div className="p-8 text-center text-gray-500">Загрузка упражнения...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto glass-card rounded-3xl p-6 sm:p-10 shadow-2xl border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 animate-fadeIn">
      <div className="flex items-center justify-between border-b border-purple-100 dark:border-gray-700 pb-4 mb-6">
        <div>
          <span className="text-xs font-bold bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2.5 py-1 rounded-full">
            {currentItem.level} • {currentItem.category}
          </span>
          <h3 className="text-lg font-extrabold text-gray-900 dark:text-white mt-1">
            {t('tab_word_tiles', 'Конструктор фраз')}
          </h3>
        </div>
        <div className="text-sm font-bold text-purple-600 dark:text-purple-400">
          {currentIndex + 1} / {items.length}
        </div>
      </div>

      <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/40 dark:to-pink-950/40 border-l-4 border-fuchsia-500 text-gray-900 dark:text-white text-lg font-medium">
        «{currentItem.prompt}»
      </div>

      <div className="min-h-[70px] p-4 rounded-2xl border-2 border-dashed border-purple-300 dark:border-purple-700 bg-purple-50/40 dark:bg-gray-900/40 mb-6 flex flex-wrap gap-2 items-center">
        {selectedTiles.length === 0 ? (
          <span className="text-sm text-gray-400 italic">Нажимайте на слова внизу в правильном порядке...</span>
        ) : (
          selectedTiles.map((tile) => (
            <button
              key={tile.id}
              onClick={() => handleRemoveTile(tile)}
              disabled={isSubmitted}
              className="px-3.5 py-2 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white rounded-xl font-bold shadow-md hover:from-fuchsia-600 hover:to-purple-700 active:scale-95 transition-all text-sm animate-fadeIn"
            >
              {tile.text}
            </button>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-2.5 mb-8 justify-center">
        {availableTiles.map((tile) => (
          <button
            key={tile.id}
            onClick={() => handleTileClick(tile)}
            disabled={isSubmitted}
            className="px-4 py-2.5 bg-white dark:bg-gray-700 border-2 border-purple-200 dark:border-gray-600 text-gray-800 dark:text-gray-100 rounded-xl font-bold shadow-sm hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-gray-600 active:scale-95 transition-all text-sm"
          >
            {tile.text}
          </button>
        ))}
      </div>

      {isSubmitted && (
        <div className={`p-4 rounded-2xl mb-6 flex items-center justify-between ${
          isCorrect
            ? 'bg-green-100 dark:bg-green-950/50 border border-green-400 text-green-900 dark:text-green-200'
            : 'bg-red-100 dark:bg-red-950/50 border border-red-400 text-red-900 dark:text-red-200'
        }`}>
          <div className="flex items-center space-x-3">
            {isCorrect ? <CheckCircle2 className="w-6 h-6 text-green-600" /> : <XCircle className="w-6 h-6 text-red-600" />}
            <div>
              <div className="font-bold text-base">{isCorrect ? '¡Correcto! (+20 XP)' : 'Respuesta correcta:'}</div>
              <div className="text-sm font-semibold">{currentItem.correctSentence}</div>
            </div>
          </div>
          <button
            onClick={() => speakSpanish(currentItem.correctSentence)}
            className="p-2 bg-white/40 hover:bg-white/60 rounded-xl transition-colors"
            title="Прослушать"
          >
            <Volume2 className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-purple-100 dark:border-gray-700">
        <button
          onClick={() => setShowHint(!showHint)}
          className="text-xs text-purple-600 dark:text-purple-400 font-bold hover:underline flex items-center gap-1"
        >
          <HelpCircle className="w-4 h-4" />
          <span>{showHint ? currentItem.hint : 'Подсказка'}</span>
        </button>

        <div className="flex gap-3">
          {!isSubmitted ? (
            <button
              onClick={handleVerify}
              disabled={selectedTiles.length === 0}
              className="px-6 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold rounded-xl shadow-lg hover:from-fuchsia-600 hover:to-purple-700 active:scale-95 disabled:opacity-50 transition-all text-sm"
            >
              {t('btn_check', 'Проверить')}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="px-6 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-xl shadow-lg hover:from-green-600 hover:to-emerald-700 active:scale-95 transition-all text-sm flex items-center gap-2"
            >
              <span>{t('btn_next', 'Следующая фраза')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// 2. SPEED MATCH BLITZ
// ----------------------------------------------------
function SpeedMatchSection() {
  const { t } = useLanguage();
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

        const esList = rawPairs.map((p, i) => ({ id: i, text: p.es })).sort(() => 0.5 - Math.random());
        const ruList = rawPairs.map((p, i) => ({ id: i, text: p.ru })).sort(() => 0.5 - Math.random());

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
            soundEngine.playLevelUp();
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
            soundEngine.playLevelUp();
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
    <div className="max-w-4xl mx-auto glass-card rounded-3xl p-6 sm:p-10 shadow-2xl border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 animate-fadeIn">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-purple-100 dark:border-gray-700">
        <div>
          <h3 className="text-xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-500" />
            Speed Match Blitz
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Сопоставляйте пары слов до истечения 30 секунд.
          </p>
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
        <div className="text-center py-12">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center mx-auto text-4xl shadow-xl mb-4">
            ⚡
          </div>
          <h4 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-2">
            Готовы к раунду на скорость?
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto mb-6">
            У вас есть 30 секунд, чтобы найти все 6 пар. Держите комбо для максимального XP!
          </p>
          <button
            onClick={startRound}
            className="px-8 py-3.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-extrabold text-base rounded-2xl shadow-xl transition-transform active:scale-95"
          >
            Начать раунд 🚀
          </button>
        </div>
      )}

      {isPlaying && (
        <div className="grid grid-cols-2 gap-4 sm:gap-6 my-6">
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 text-center">
              🇪🇸 Español
            </div>
            {esCards.map((card) => {
              const isMatched = matchedIds.has(card.id);
              const isSelected = selectedEs?.id === card.id;

              if (isMatched) {
                return <div key={card.id} className="h-14 rounded-2xl border border-transparent bg-transparent opacity-0 pointer-events-none" />;
              }

              return (
                <button
                  key={card.id}
                  onClick={() => handleCardClick('es', card)}
                  className={`w-full h-14 px-4 rounded-2xl font-bold text-sm sm:text-base border-2 shadow-sm transition-all flex items-center justify-center text-center ${
                    isSelected
                      ? 'bg-purple-600 text-white border-purple-600 shadow-md scale-105'
                      : 'bg-white dark:bg-gray-700 border-purple-200 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:border-purple-400 active:scale-95'
                  }`}
                >
                  {card.text}
                </button>
              );
            })}
          </div>

          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 text-center">
              🇷🇺 Перевод
            </div>
            {ruCards.map((card) => {
              const isMatched = matchedIds.has(card.id);
              const isSelected = selectedRu?.id === card.id;

              if (isMatched) {
                return <div key={card.id} className="h-14 rounded-2xl border border-transparent bg-transparent opacity-0 pointer-events-none" />;
              }

              return (
                <button
                  key={card.id}
                  onClick={() => handleCardClick('ru', card)}
                  className={`w-full h-14 px-4 rounded-2xl font-bold text-sm sm:text-base border-2 shadow-sm transition-all flex items-center justify-center text-center ${
                    isSelected
                      ? 'bg-fuchsia-600 text-white border-fuchsia-600 shadow-md scale-105'
                      : 'bg-white dark:bg-gray-700 border-purple-200 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:border-fuchsia-400 active:scale-95'
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
        <div className="text-center py-10 animate-fadeIn">
          <div className="text-5xl mb-3">{matchedIds.size === pairs.length ? '🏆' : '⏰'}</div>
          <h4 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-1">
            {matchedIds.size === pairs.length ? 'Превосходно! Все пары найдены!' : 'Время вышло!'}
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Очки: <span className="font-extrabold text-purple-600">{score} pts</span> • Найдено: {matchedIds.size}/{pairs.length}
          </p>
          <button
            onClick={startRound}
            className="px-6 py-3 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold rounded-xl shadow-lg hover:from-fuchsia-600 hover:to-purple-700 active:scale-95 transition-all text-sm"
          >
            Сыграть еще раз ⚡
          </button>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 3. ERROR DETECTIVE
// ----------------------------------------------------
function ErrorDetectiveSection() {
  const { t } = useLanguage();
  const [items, setItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedFix, setSelectedFix] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [ruleExplanation, setRuleExplanation] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await profileFetch(profileApiUrl('/spanish/api/exercises/error-detective'));
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
      const res = await profileFetch(profileApiUrl('/spanish/api/exercises/error-detective/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: currentItem.id, selectedFix: option })
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
    <div className="max-w-3xl mx-auto glass-card rounded-3xl p-6 sm:p-10 shadow-2xl border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 animate-fadeIn">
      <div className="flex items-center justify-between border-b border-purple-100 dark:border-gray-700 pb-4 mb-6">
        <div>
          <span className="text-xs font-bold bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2.5 py-1 rounded-full">
            {currentItem.level}
          </span>
          <h3 className="text-lg font-extrabold text-gray-900 dark:text-white mt-1">
            🔍 Детектив грамматических ошибок
          </h3>
        </div>
        <div className="text-sm font-bold text-purple-600 dark:text-purple-400">
          {currentIndex + 1} / {items.length}
        </div>
      </div>

      <div className="p-6 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/40 dark:to-pink-950/40 border border-purple-200 dark:border-purple-700 mb-6">
        <div className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-2">
          Найдите и исправьте ошибку в этой фразе:
        </div>
        <p className="text-lg font-semibold text-gray-900 dark:text-white leading-relaxed">
          {currentItem.sentence}
        </p>
      </div>

      <div className="space-y-3 mb-6">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Какой вариант исправления правильный?
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {currentItem.options.map((opt, idx) => {
            let btnStyle = 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:border-purple-400';
            if (isSubmitted) {
              if (opt === currentItem.correctWord) {
                btnStyle = 'bg-green-100 dark:bg-green-900/60 border-green-500 text-green-900 dark:text-green-200 font-bold';
              } else if (opt === selectedFix) {
                btnStyle = 'bg-red-100 dark:bg-red-900/60 border-red-500 text-red-900 dark:text-red-200';
              } else {
                btnStyle = 'opacity-40';
              }
            }

            return (
              <button
                key={idx}
                onClick={() => handleSelectOption(opt)}
                disabled={isSubmitted}
                className={`p-3.5 text-left rounded-xl border-2 font-semibold text-sm transition-all shadow-sm ${btnStyle}`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {isSubmitted && (
        <div className="p-5 rounded-2xl bg-purple-50 dark:bg-gray-750 border border-purple-200 dark:border-gray-600 mb-6 animate-fadeIn">
          <div className="font-bold text-sm text-purple-900 dark:text-purple-200 mb-1 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-purple-600" />
            Объяснение правила:
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {ruleExplanation}
          </p>
        </div>
      )}

      {isSubmitted && (
        <div className="flex justify-end">
          <button
            onClick={handleNext}
            className="px-6 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold rounded-xl shadow-lg hover:from-fuchsia-600 hover:to-purple-700 active:scale-95 transition-all text-sm flex items-center gap-2"
          >
            <span>Следующее задание</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 4. VERB CONJUGATION DRILLS (FIXED UI BUG!)
// ----------------------------------------------------
function VerbConjugationDrills({ onTopicUpdated }) {
  const { t } = useLanguage();
  const [drillType, setDrillType] = useState('regular');
  const [pronounMode, setPronounMode] = useState('all');
  const [runMode, setRunMode] = useState('ten');
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [stats, setStats] = useState({ correct: 0, incorrect: 0, completed: 0 });

  const startSession = () => {
    setStats({ correct: 0, incorrect: 0, completed: 0 });
    setCurrentQuestion(createVerbDrillQuestion(drillType, pronounMode));
    setAnswer('');
    setShowResult(false);
    setIsCorrect(false);
    setSessionActive(true);
  };

  const checkDrillAnswer = async () => {
    if (!currentQuestion || showResult || !answer.trim()) return;

    const correct = isVerbDrillAnswerCorrect(answer, currentQuestion);
    const nextStats = {
      correct: stats.correct + (correct ? 1 : 0),
      incorrect: stats.incorrect + (correct ? 0 : 1),
      completed: stats.completed + 1,
    };

    setIsCorrect(correct);
    setStats(nextStats);
    setShowResult(true);

    if (correct) soundEngine.playCorrect();
    else soundEngine.playWrong();

    try {
      await profileFetch(profileApiUrl('/spanish/api/topics/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: getVerbDrillProgressTopic(currentQuestion),
          category: 'Practice',
          level: DRILL_TYPES[drillType]?.level || 'A1',
          success: correct,
          eventId: globalThis.crypto?.randomUUID?.() || 'verb-' + Date.now() + '-' + stats.completed,
          activityType: 'verb_drill',
        }),
      });
      if (typeof onTopicUpdated === 'function') onTopicUpdated();
    } catch (error) {
      console.error('Error updating verb drill topic:', error);
    }
  };

  const nextQuestion = () => {
    if (isVerbDrillFinished(stats, runMode)) {
      setSessionActive(false);
      soundEngine.playLevelUp();
      return;
    }
    setCurrentQuestion(createVerbDrillQuestion(drillType, pronounMode));
    setAnswer('');
    setShowResult(false);
    setIsCorrect(false);
  };

  return (
    <div className="max-w-3xl mx-auto glass-card rounded-3xl p-6 sm:p-10 shadow-2xl border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 animate-fadeIn">
      <div className="flex items-center justify-between border-b border-purple-100 dark:border-gray-700 pb-4 mb-6">
        <div>
          <h3 className="text-xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
            <Target className="w-6 h-6 text-fuchsia-500" />
            {t('verb_drills_title', 'Тренировка спряжения глаголов')}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('verb_drills_sub', 'Отрабатывай правильные и неправильные глаголы с аргентинским voseo.')}
          </p>
        </div>
      </div>

      {!sessionActive ? (
        <div className="space-y-6">
          {/* Verb Type Picker (Fixed with proper labels!) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              {t('verb_types_label', 'Тип глаголов:')}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {Object.entries(DRILL_TYPES).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => {
                    soundEngine.playTileClick();
                    setDrillType(k);
                  }}
                  className={`p-3.5 rounded-2xl border-2 text-left transition-all ${
                    drillType === k
                      ? 'bg-purple-100 dark:bg-purple-900/60 border-purple-500 text-purple-900 dark:text-purple-200 shadow-md font-bold'
                      : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-purple-300 bg-white dark:bg-gray-800'
                  }`}
                >
                  <div className="font-extrabold text-sm">{v.label}</div>
                  {v.rules && v.rules.length > 0 && (
                    <div className="text-[11px] opacity-75 mt-0.5 line-clamp-1">{v.rules[0]}</div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Pronoun Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              {t('verb_pronouns_label', 'Местоимения:')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(DRILL_PRONOUN_MODES).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => {
                    soundEngine.playTileClick();
                    setPronounMode(k);
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                    pronounMode === k
                      ? 'bg-fuchsia-500 text-white border-fuchsia-500 shadow'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={startSession}
            className="w-full py-3.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-extrabold text-base rounded-2xl shadow-xl hover:from-fuchsia-600 hover:to-purple-700 active:scale-95 transition-all"
          >
            {t('verb_start_btn', 'Начать тренировку')}
          </button>
        </div>
      ) : (
        <div>
          {currentQuestion && (
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/40 dark:to-pink-950/40 border border-purple-200 dark:border-gray-700 text-center">
                <div className="text-xs font-bold uppercase text-purple-600 dark:text-purple-400 mb-1">
                  Глагол: {currentQuestion.verb} ({currentQuestion.translation})
                </div>
                <div className="text-2xl font-extrabold text-gray-900 dark:text-white my-2">
                  {currentQuestion.prompt || `${currentQuestion.pronoun} _______`}
                </div>
                {currentQuestion.instruction && (
                  <div className="text-xs text-gray-500 italic">{currentQuestion.instruction}</div>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={showResult}
                  placeholder="Введи форму глагола..."
                  className="flex-1 px-4 py-3 border-2 border-purple-200 dark:border-gray-600 dark:bg-gray-800 rounded-xl font-bold text-gray-900 dark:text-white focus:border-purple-500 focus:outline-none"
                  onKeyDown={(e) => e.key === 'Enter' && checkDrillAnswer()}
                />
                {!showResult ? (
                  <button
                    onClick={checkDrillAnswer}
                    disabled={!answer.trim()}
                    className="px-6 py-3 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold rounded-xl shadow-md disabled:opacity-50"
                  >
                    {t('verb_check_btn', 'Проверить')}
                  </button>
                ) : (
                  <button
                    onClick={nextQuestion}
                    className="px-6 py-3 bg-green-600 text-white font-bold rounded-xl shadow-md flex items-center gap-1.5"
                  >
                    <span>{t('verb_next_btn', 'Далее')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>

              {showResult && (
                <div className={`p-4 rounded-xl font-bold text-sm ${isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {isCorrect ? '¡Excelente! Форма верна.' : `Неверно. Правильная форма: ${getVerbDrillDisplayAnswer(currentQuestion)}`}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// 5. CLASSIC QUIZ & FILL-IN (RESTORED!)
// ----------------------------------------------------
function ClassicQuizSection() {
  const { t } = useLanguage();
  const [exercises, setExercises] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [userFillAnswer, setUserFillAnswer] = useState('');
  const [isAnswered, setIsAnswered] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchExercises = async () => {
    try {
      setLoading(true);
      const res = await profileFetch(profileApiUrl('/spanish/api/exercises?level=A1&category=Grammar'));
      if (res.ok) {
        const data = await res.json();
        setExercises(data || []);
      }
    } catch (err) {
      console.error('Error fetching classic exercises:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExercises();
  }, []);

  const currentEx = exercises[currentIndex];

  const handleCheck = () => {
    if (isAnswered || !currentEx) return;
    setIsAnswered(true);
    const userAnswer = currentEx.type === 'multiple-choice' ? selectedOption : userFillAnswer.trim();
    const correct = (userAnswer || '').toLowerCase() === (currentEx.correctAnswer || '').toLowerCase();
    if (correct) soundEngine.playCorrect();
    else soundEngine.playWrong();
  };

  const handleNext = () => {
    setCurrentIndex(i => (i + 1) % exercises.length);
    setSelectedOption(null);
    setUserFillAnswer('');
    setIsAnswered(false);
  };

  if (loading || !currentEx) {
    return <div className="p-8 text-center text-gray-500">Загрузка упражнений...</div>;
  }

  const userAnswer = currentEx.type === 'multiple-choice' ? selectedOption : userFillAnswer.trim();
  const isCorrect = (userAnswer || '').toLowerCase() === (currentEx.correctAnswer || '').toLowerCase();

  return (
    <div className="max-w-3xl mx-auto glass-card rounded-3xl p-6 sm:p-10 shadow-2xl border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 animate-fadeIn">
      <div className="flex items-center justify-between border-b border-purple-100 dark:border-gray-700 pb-4 mb-6">
        <div>
          <span className="text-xs font-bold bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2.5 py-1 rounded-full">
            {currentEx.level} • {currentEx.topic}
          </span>
          <h3 className="text-lg font-extrabold text-gray-900 dark:text-white mt-1">
            {currentEx.type === 'multiple-choice' ? 'Тест с выбором ответа' : 'Вставка слова'}
          </h3>
        </div>
        <div className="text-sm font-bold text-purple-600 dark:text-purple-400">
          {currentIndex + 1} / {exercises.length}
        </div>
      </div>

      <p className="text-lg font-bold text-gray-900 dark:text-white mb-6">
        {currentEx.question}
      </p>

      {currentEx.type === 'multiple-choice' && (
        <div className="space-y-3 mb-6">
          {(currentEx.options || []).map((opt, idx) => {
            let btnStyle = 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:border-purple-400';
            if (isAnswered) {
              if (opt.toLowerCase() === (currentEx.correctAnswer || '').toLowerCase()) {
                btnStyle = 'bg-green-100 dark:bg-green-900/60 border-green-500 text-green-900 dark:text-green-200 font-bold';
              } else if (opt === selectedOption) {
                btnStyle = 'bg-red-100 dark:bg-red-900/60 border-red-500 text-red-900 dark:text-red-200';
              } else {
                btnStyle = 'opacity-40';
              }
            } else if (selectedOption === opt) {
              btnStyle = 'bg-purple-100 border-purple-500 text-purple-900 font-bold';
            }

            return (
              <button
                key={idx}
                onClick={() => !isAnswered && setSelectedOption(opt)}
                disabled={isAnswered}
                className={`w-full text-left p-4 rounded-xl border-2 font-medium text-sm transition-all ${btnStyle}`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}

      {currentEx.type !== 'multiple-choice' && (
        <div className="mb-6">
          <input
            type="text"
            value={userFillAnswer}
            onChange={(e) => setUserFillAnswer(e.target.value)}
            disabled={isAnswered}
            placeholder="Введи ответ на испанском..."
            className="w-full px-4 py-3 border-2 border-purple-200 dark:border-gray-600 dark:bg-gray-800 rounded-xl font-bold text-gray-900 dark:text-white focus:border-purple-500 focus:outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
          />
        </div>
      )}

      {isAnswered && (
        <div className={`p-4 rounded-xl font-bold text-sm mb-6 ${isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {isCorrect ? '¡Excelente! Ответ правильный.' : `Неверно. Правильный ответ: ${currentEx.correctAnswer}`}
        </div>
      )}

      <div className="flex justify-end">
        {!isAnswered ? (
          <button
            onClick={handleCheck}
            disabled={currentEx.type === 'multiple-choice' ? !selectedOption : !userFillAnswer.trim()}
            className="px-6 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold rounded-xl shadow disabled:opacity-50"
          >
            {t('btn_check', 'Проверить')}
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="px-6 py-2.5 bg-green-600 text-white font-bold rounded-xl shadow flex items-center gap-1.5"
          >
            <span>{t('btn_next', 'Следующее')}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------
// MAIN EXERCISES HUB
// ----------------------------------------------------
export default function Exercises() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('word_tiles');

  const tabs = [
    { id: 'word_tiles', label: t('tab_word_tiles', 'Конструктор фраз'), emoji: '🧩' },
    { id: 'speed_match', label: t('tab_speed_match', 'Speed Match Blitz'), emoji: '⚡' },
    { id: 'error_detective', label: t('tab_error_detective', 'Детектив ошибок'), emoji: '🔍' },
    { id: 'verb_drills', label: t('tab_verb_drills', 'Спряжения глаголов'), emoji: '🎯' },
    { id: 'classic_quiz', label: t('tab_classic_quiz', 'Тесты & Вставка слов'), emoji: '📝' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gradient flex items-center gap-3">
          <Brain className="h-9 w-9 text-fuchsia-500" />
          {t('gym_title', 'Интерактивный тренажер испанского')}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm sm:text-base">
          {t('gym_sub', 'Выбирай формат практики для развития речи, грамматики и словарного запаса.')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-8 bg-white/80 dark:bg-gray-800/80 p-2 rounded-2xl border border-purple-100 dark:border-gray-700 shadow-sm">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                soundEngine.playTileClick();
                setActiveTab(tab.id);
              }}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-md scale-105'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-purple-50 dark:hover:bg-gray-700'
              }`}
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'word_tiles' && <WordTilesSection />}
      {activeTab === 'speed_match' && <SpeedMatchSection />}
      {activeTab === 'error_detective' && <ErrorDetectiveSection />}
      {activeTab === 'verb_drills' && <VerbConjugationDrills />}
      {activeTab === 'classic_quiz' && <ClassicQuizSection />}
    </div>
  );
}
