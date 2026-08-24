import ExamModal from './ExamModal';
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Brain, Lightbulb, Target, RefreshCw, CheckCircle, XCircle, Award, Trophy, ListOrdered,
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
// 0. SENTENCE TRANSLATION (RUSSIAN -> SPANISH)
// ----------------------------------------------------
function SentenceTranslationExerciseSection() {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState('all');
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [exercises, setExercises] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userTranslation, setUserTranslation] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const fetchTopics = async () => {
      try {
        const res = await profileFetch(profileApiUrl('/spanish/api/curriculum/topics'));
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data.topics) ? data.topics : Array.isArray(data) ? data : [];
          setTopics(list);
        }
      } catch (err) {
        console.warn('Could not load topics for translation:', err);
      }
    };
    fetchTopics();
  }, []);

  const filteredTopics = selectedLevel === 'all' 
    ? topics 
    : topics.filter(t => t.level === selectedLevel);

  const fetchTranslations = async () => {
    setLoading(true);
    setShowResult(false);
    setUserTranslation('');
    setShowHint(false);
    setCurrentIndex(0);

    try {
      const res = await profileFetch(profileApiUrl('/spanish/api/exercises/generate-translation'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: selectedLevel !== 'all' ? selectedLevel : undefined,
          topicId: selectedTopic !== 'all' ? selectedTopic : undefined
        })
      });
      const data = await res.json();
      setExercises(data.exercises || []);
    } catch (err) {
      console.error('Error generating translations:', err);
    } finally {
      setLoading(false);
    }
  };

  const current = exercises[currentIndex] || null;

  const handleCheck = () => {
    if (!current || showResult || !userTranslation.trim()) return;

    const match = checkGrammarAnswerMatch(
      userTranslation,
      current.targetSentence,
      current.alternativeAnswers || current.alternativeTranslations || []
    );

    setIsCorrect(match);
    setShowResult(true);

    if (match) soundEngine.playCorrect();
    else soundEngine.playWrong();
  };

  const handleNext = () => {
    if (currentIndex + 1 < exercises.length) {
      setCurrentIndex((prev) => prev + 1);
      setUserTranslation('');
      setShowResult(false);
      setShowHint(false);
    } else {
      setExercises([]);
      setCurrentIndex(0);
    }
  };

  return (
    <div className="max-w-4xl mx-auto glass-card rounded-3xl p-6 sm:p-10 shadow-2xl border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 animate-fadeIn space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-100 dark:border-gray-700 pb-4">
        <div>
          <h3 className="text-xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
            <Globe className="h-6 w-6 text-fuchsia-600 dark:text-fuchsia-400" />
            <span>Перевод предложений</span>
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Переводите аутентичные предложения с русского на испанский.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Level Filter */}
          <select
            value={selectedLevel}
            onChange={(e) => {
              setSelectedLevel(e.target.value);
              setSelectedTopic('all');
            }}
            className="px-3 py-2 rounded-xl bg-white dark:bg-gray-700 border border-purple-200 dark:border-gray-600 text-xs sm:text-sm font-bold text-gray-900 dark:text-white focus:outline-none"
          >
            <option value="all">🌍 Все уровни (A1–C2)</option>
            {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((lvl) => (
              <option key={lvl} value={lvl}>Уровень {lvl}</option>
            ))}
          </select>

          {/* Topic Selector */}
          <select
            value={selectedTopic}
            onChange={(e) => setSelectedTopic(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-gray-700 border border-purple-200 dark:border-gray-600 text-xs sm:text-sm font-semibold text-gray-900 dark:text-white max-w-xs truncate focus:outline-none"
          >
            <option value="all">
              {selectedLevel === 'all' ? '🎯 Все темы курса' : `🎯 Все темы уровня ${selectedLevel}`}
            </option>
            {filteredTopics.map((t) => (
              <option key={t.id} value={t.id}>
                {selectedLevel === 'all' ? `${t.level}: ${t.name}` : t.name}
              </option>
            ))}
          </select>

          <button
            onClick={fetchTranslations}
            disabled={loading}
            className="px-4 py-2 bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
            <span>{loading ? 'Генерируем...' : 'Сгенерировать ⚡'}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center space-y-3">
          <RefreshCw className="h-8 w-8 text-purple-600 animate-spin mx-auto" />
          <p className="text-sm font-medium text-gray-500">Подготовка предложений для перевода...</p>
        </div>
      ) : current ? (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/40 dark:to-pink-950/40 border border-purple-200 dark:border-purple-800 space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">Переведите на испанский:</span>
            <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white leading-snug">
              {current.sourceSentence}
            </p>
          </div>

          <div className="space-y-2">
            <textarea
              rows="3"
              value={userTranslation}
              onChange={(e) => setUserTranslation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), !showResult ? handleCheck() : handleNext())}
              placeholder="Escribe la traducción en español..."
              disabled={showResult}
              className="w-full p-4 rounded-xl border-2 border-purple-200 dark:border-gray-600 dark:bg-gray-750 focus:border-purple-600 focus:outline-none text-base font-semibold text-gray-900 dark:text-white"
            />
            {current.hint && (
              <button
                type="button"
                onClick={() => setShowHint(!showHint)}
                className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span>{showHint ? `Подсказка: ${current.hint}` : 'Показать грамматическую подсказку'}</span>
              </button>
            )}
          </div>

          {showResult && (
            <div className={`p-4 rounded-xl border space-y-2 animate-fadeIn ${
              isCorrect ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700' : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`font-bold text-sm ${isCorrect ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300'}`}>
                  {isCorrect ? '✅ Верно! Отличный перевод' : '❌ Эталонный вариант перевода:'}
                </span>
                <button
                  type="button"
                  onClick={() => speakSpanish(current.targetSentence)}
                  className="p-1 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:text-purple-600 shadow-sm"
                  title="Озвучить на испанском"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
              </div>
              <p className="text-base font-bold text-gray-900 dark:text-white">{current.targetSentence}</p>
              {current.explanation && (
                <p className="text-xs text-gray-600 dark:text-gray-400 pt-1">💡 {current.explanation}</p>
              )}
            </div>
          )}

          <div className="flex justify-end">
            {!showResult ? (
              <button
                onClick={handleCheck}
                disabled={!userTranslation.trim()}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold rounded-xl shadow-md text-sm"
              >
                Проверить перевод
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="px-6 py-3 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold rounded-xl shadow-lg text-sm flex items-center gap-2"
              >
                <span>{currentIndex + 1 >= exercises.length ? 'Завершить раунд 🏆' : 'Следующее предложение'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 space-y-3">
          <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-300 flex items-center justify-center mx-auto text-2xl font-bold">
            🌐
          </div>
          <h4 className="text-lg font-bold text-gray-800 dark:text-white">Выберите тему и нажмите «Сгенерировать ⚡»</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
            ИИ подготовит контекстные предложения для перевода на испанский язык с проверкой синонимов.
          </p>
        </div>
      )}
    </div>
  );
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
      <div className="mb-5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100 text-xs sm:text-sm">
        Свободная смешанная практика: здесь могут встречаться фразы из будущих модулей. Для учебного маршрута используйте вкладку «Тесты & Вставка слов».
      </div>
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
  const [drillType, setDrillType] = useState('fourKeyVerbs'); // 'fourKeyVerbs' | 'regular' | 'ser' | 'estar' | 'tener' | 'ir' | 'serEstar'
  const [pronounMode, setPronounMode] = useState('all');
  const [runMode, setRunMode] = useState('ten');
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [stats, setStats] = useState({ correct: 0, incorrect: 0, completed: 0 });
  const [showRuleHint, setShowRuleHint] = useState(false);

  const SPANISH_CHARS = ['á', 'é', 'í', 'ó', 'ú', 'ñ', '¿', '¡'];

  const startSession = () => {
    setStats({ correct: 0, incorrect: 0, completed: 0 });
    setCurrentQuestion(createVerbDrillQuestion(drillType, pronounMode));
    setAnswer('');
    setShowResult(false);
    setIsCorrect(false);
    setShowRuleHint(false);
    setSessionActive(true);
    soundEngine.playLevelUp();
  };

  const checkDrillAnswer = async () => {
    if (!currentQuestion || showResult || !answer.trim()) return;

    const correct = isVerbDrillAnswerCorrect(answer, currentQuestion);
    const nextStats = {
      correct: stats.correct + (correct ? 1 : 0),
      incorrect: stats.incorrect + (correct ? 0 : 1),
      completed: stats.completed + 1,
    };

    setStats(nextStats);
    setIsCorrect(correct);
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

  const insertChar = (c) => setAnswer(prev => prev + c);

  const currentRules = DRILL_TYPES[drillType]?.rules || [];

  return (
    <div className="max-w-3xl mx-auto glass-card rounded-3xl p-6 sm:p-10 shadow-2xl border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 animate-fadeIn">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-purple-100 dark:border-gray-700 pb-4 mb-6">
        <div>
          <h3 className="text-xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
            <Target className="w-6 h-6 text-fuchsia-500" />
            <span>Тренировка спряжения глаголов</span>
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Отрабатывай 4 главных глагола (ser, estar, tener, ir) и правильные окончания с аргентинским voseo.
          </p>
        </div>

        {sessionActive && (
          <button
            onClick={() => setShowRuleHint(!showRuleHint)}
            className="px-3.5 py-1.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 font-bold text-xs hover:bg-amber-100 transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Lightbulb className="w-4 h-4 text-amber-600" />
            <span>{showRuleHint ? 'Скрыть подсказку ▲' : '💡 Подсказка правила ▼'}</span>
          </button>
        )}
      </div>

      {/* RULE HINT MODAL / ACCORDION */}
      {showRuleHint && currentRules.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/90 dark:bg-amber-950/50 border-2 border-amber-300 dark:border-amber-700 shadow-md mb-6 animate-fadeIn space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-black text-sm text-amber-950 dark:text-amber-200">
              <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <span>Правило и шпаргалка спряжений: {DRILL_TYPES[drillType]?.label}</span>
            </div>
            <button
              onClick={() => setShowRuleHint(false)}
              className="text-xs text-amber-700 hover:text-amber-900 font-bold"
            >
              ✕ Закрыть
            </button>
          </div>

          <div className="space-y-2 text-xs sm:text-sm font-medium text-amber-950 dark:text-amber-100">
            {currentRules.map((rule, rIdx) => (
              <div key={rIdx} className="p-2.5 rounded-xl bg-white/80 dark:bg-gray-800/80 border border-amber-200 dark:border-amber-800">
                {rule}
              </div>
            ))}
          </div>
        </div>
      )}

      {!sessionActive ? (
        <div className="space-y-6">
          {/* Verb Type Picker */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                Тип глаголов:
              </label>
              <button
                onClick={() => setShowRuleHint(!showRuleHint)}
                className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span>{showRuleHint ? 'Скрыть шпаргалку' : 'Посмотреть шпаргалку правил'}</span>
              </button>
            </div>

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
              Местоимения:
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

          {/* Start Button */}
          <button
            onClick={startSession}
            className="w-full py-4 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-black text-base sm:text-lg rounded-2xl shadow-xl hover:from-fuchsia-600 hover:to-purple-700 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Play className="w-5 h-5" />
            <span>Начать тренировку спряжений</span>
          </button>
        </div>
      ) : (
        <div>
          {currentQuestion && (
            <div className="space-y-6 animate-fadeIn">
              <div className="p-6 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/40 dark:to-pink-950/40 border border-purple-200 dark:border-gray-700 text-center relative">
                <div className="text-xs font-bold uppercase text-purple-600 dark:text-purple-400 mb-1">
                  Глагол: {currentQuestion.verb} ({currentQuestion.translation})
                </div>
                <div className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white my-2">
                  {currentQuestion.prompt || `${currentQuestion.pronoun} _______`}
                </div>
                {currentQuestion.instruction && (
                  <div className="text-xs text-gray-500 italic mt-1">{currentQuestion.instruction}</div>
                )}
              </div>

              {/* Input & Virtual Chars */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    disabled={showResult}
                    placeholder="Введи форму глагола..."
                    className="flex-1 px-4 py-3.5 border-2 border-purple-200 dark:border-gray-600 dark:bg-gray-800 rounded-xl font-bold text-base text-gray-900 dark:text-white focus:border-purple-500 focus:outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && (showResult ? nextQuestion() : checkDrillAnswer())}
                  />
                  {!showResult ? (
                    <button
                      onClick={checkDrillAnswer}
                      disabled={!answer.trim()}
                      className="px-6 py-3.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold rounded-xl shadow-md disabled:opacity-50"
                    >
                      Проверить
                    </button>
                  ) : (
                    <button
                      onClick={nextQuestion}
                      className="px-6 py-3.5 bg-green-600 text-white font-bold rounded-xl shadow-md flex items-center gap-1.5"
                    >
                      <span>Далее ➔</span>
                    </button>
                  )}
                </div>

                {!showResult && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] font-bold text-gray-500 mr-1">Быстрый ввод:</span>
                    {SPANISH_CHARS.map((char) => (
                      <button
                        key={char}
                        type="button"
                        onClick={() => insertChar(char)}
                        className="px-2 py-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-black text-gray-800 dark:text-gray-200 hover:bg-purple-100 dark:hover:bg-purple-900 transition-colors shadow-sm"
                      >
                        {char}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Feedback and Rule Explanation on Check */}
              {showResult && (
                <div className="space-y-3 animate-fadeIn">
                  <div className={`p-4 rounded-2xl font-bold text-sm border-2 ${
                    isCorrect
                      ? 'bg-green-50 dark:bg-green-950/40 border-green-500 text-green-900 dark:text-green-200'
                      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-500 text-rose-900 dark:text-rose-200'
                  }`}>
                    <div className="text-base font-black flex items-center gap-2">
                      {isCorrect ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-rose-600" />}
                      <span>{isCorrect ? '¡Excelente! Форма верна.' : `Неверно. Правильная форма: ${getVerbDrillDisplayAnswer(currentQuestion)}`}</span>
                    </div>

                    {currentQuestion.reason && (
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mt-2 pl-7">
                        💡 {currentQuestion.reason}
                      </p>
                    )}
                  </div>

                  {/* Compact rule reminder box */}
                  <div className="p-3.5 rounded-xl bg-purple-50/70 dark:bg-gray-750 border border-purple-200 dark:border-gray-700 text-xs text-purple-950 dark:text-purple-200 flex items-start gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-bold">Шпаргалка: </strong>
                      <span>{currentRules[0] || 'Обратите внимание на спряжение для данного местоимения.'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// 5. CLASSIC QUIZ & FILL-IN & EXAM BUILDER (AI-POWERED)
// ----------------------------------------------------
function ClassicQuizSection({ topicIds = [] }) {
  const { t } = useLanguage();
  const [availableTopics, setAvailableTopics] = useState([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState(topicIds.length > 0 ? topicIds : [1, 27]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showTopicSelector, setShowTopicSelector] = useState(false);

  const [exercises, setExercises] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [userFillAnswer, setUserFillAnswer] = useState('');
  const [isAnswered, setIsAnswered] = useState(false);
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [error, setError] = useState('');
  
  // Exam Modal State
  const [examModalConfig, setExamModalConfig] = useState({
    isOpen: false,
    level: 'A1',
    examType: 'custom',
    topicIds: []
  });

  const attemptEventRef = useRef(null);
  const startedAtRef = useRef(Date.now());

  // Fetch available A1 topics for selection
  useEffect(() => {
    const fetchTopics = async () => {
      try {
        const res = await profileFetch(profileApiUrl('/spanish/api/curriculum/topics?level=A1'));
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data.topics) ? data.topics : Array.isArray(data) ? data : [];
          setAvailableTopics(list.filter(t => t.level === 'A1' || !t.level));
        }
      } catch (err) {
        console.warn('Could not load topics list:', err);
      }
    };
    fetchTopics();
  }, []);

  const fetchExercises = async (customIds = selectedTopicIds, isAi = false) => {
    try {
      if (isAi) setIsGeneratingAi(true);
      else setLoading(true);
      setError('');

      if (isAi) {
        // AI batch generation
        const res = await profileFetch(profileApiUrl('/spanish/api/exercises/generate-batch'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            level: 'A1',
            topicIds: customIds,
            count: 10
          })
        });
        const data = await res.json();
        if (res.ok && Array.isArray(data.exercises) && data.exercises.length > 0) {
          setExercises(data.exercises);
          setCurrentIndex(0);
          soundEngine.playLevelUp();
        } else {
          throw new Error(data.error || 'Не удалось сгенерировать упражнения через ИИ');
        }
      } else {
        const params = new URLSearchParams({ level: 'A1', category: 'Grammar', adaptive: '1', count: '20' });
        if (customIds.length > 0) params.set('topicIds', customIds.join(','));
        const res = await profileFetch(profileApiUrl(`/spanish/api/exercises?${params.toString()}`));
        const data = await res.json().catch(() => []);
        if (!res.ok) throw new Error(data.error || 'Не удалось загрузить упражнения');
        setExercises(Array.isArray(data) ? data : []);
        setCurrentIndex(0);
      }

      startedAtRef.current = Date.now();
    } catch (err) {
      console.error('Error fetching exercises:', err);
      setError(err.message || 'Не удалось загрузить упражнения');
    } finally {
      setLoading(false);
      setIsGeneratingAi(false);
    }
  };

  // Wait for user to select topics and click generate or start
  useEffect(() => {
    setLoading(false);
  }, []);

  const toggleTopic = (id) => {
    setSelectedTopicIds(prev => {
      const numId = Number(id);
      if (prev.includes(numId)) {
        const next = prev.filter(x => x !== numId);
        return next.length > 0 ? next : prev; // keep at least 1
      } else {
        return [...prev, numId];
      }
    });
  };

  const handleSelectAllA1 = () => {
    const allIds = availableTopics.map(t => t.id);
    setSelectedTopicIds(allIds);
  };

  const handleSelectFirstFour = () => {
    const firstFour = availableTopics.slice(0, 4).map(t => t.id);
    setSelectedTopicIds(firstFour);
  };

  const currentEx = exercises[currentIndex];
  const isChoice = currentEx?.type === 'multiple-choice' || currentEx?.type === 'choice';
  const userAnswer = isChoice ? selectedOption : userFillAnswer.trim();

  const handleCheck = async () => {
    if (isAnswered || checking || !currentEx || !userAnswer) return;
    setChecking(true);
    setError('');
    if (!attemptEventRef.current) {
      attemptEventRef.current = globalThis.crypto?.randomUUID?.() || `practice-${currentEx.id}-${Date.now()}`;
    }
    try {
      const res = await profileFetch(profileApiUrl('/spanish/api/a1/practice/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId: currentEx.topicId,
          exerciseId: currentEx.id,
          answer: userAnswer,
          eventId: attemptEventRef.current,
          responseMs: Date.now() - startedAtRef.current,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось проверить ответ');
      setResult(data);
      setIsAnswered(true);
      if (data.isCorrect) soundEngine.playCorrect();
      else soundEngine.playWrong();
      window.dispatchEvent(new CustomEvent('gamification_updated'));
    } catch (err) {
      setError(err.message || 'Не удалось проверить ответ');
    } finally {
      setChecking(false);
    }
  };

  const handleNext = () => {
    setCurrentIndex(i => (i + 1) % exercises.length);
    setSelectedOption(null);
    setUserFillAnswer('');
    setIsAnswered(false);
    setResult(null);
    setError('');
    attemptEventRef.current = null;
    startedAtRef.current = Date.now();
  };

  const filteredTopics = availableTopics.filter(t => 
    !searchQuery.trim() || 
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* 1. TOPIC SELECTOR & EXAM LAUNCHER BAR */}
      <div className="max-w-4xl mx-auto p-6 rounded-3xl bg-gradient-to-br from-purple-50 via-white to-fuchsia-50 dark:from-gray-800 dark:via-gray-800 dark:to-purple-950/30 border-2 border-purple-200 dark:border-gray-700 shadow-xl space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-purple-600 text-white font-black text-sm">
                🧠 ИИ-Тренажер & Экзамены
              </span>
              <span className="text-xs font-bold text-purple-700 dark:text-purple-300">
                Выбрано тем: {selectedTopicIds.length}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Выберите любые темы курса для точечной тренировки или запуска официального экзамена от ИИ.
            </p>
          </div>

          <button
            onClick={() => setShowTopicSelector(!showTopicSelector)}
            className="px-4 py-2 rounded-xl border border-purple-300 dark:border-gray-600 bg-white dark:bg-gray-750 text-purple-700 dark:text-purple-300 font-bold text-xs hover:bg-purple-50 transition-all flex items-center justify-center gap-1.5 shadow-sm"
          >
            <ListOrdered className="w-4 h-4" />
            <span>{showTopicSelector ? 'Скрыть выбор тем ▲' : 'Выбрать темы (' + selectedTopicIds.length + ') ▼'}</span>
          </button>
        </div>

        {/* Action Buttons Row */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={() => fetchExercises(selectedTopicIds, true)}
            disabled={isGeneratingAi || loading}
            className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-black text-xs sm:text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-yellow-300" />
            <span>{isGeneratingAi ? 'Генерируем вопросы ИИ...' : 'Сгенерировать 10 вопросов ИИ ⚡'}</span>
          </button>

          <button
            onClick={() => setExamModalConfig({
              isOpen: true,
              level: 'A1',
              examType: 'custom',
              topicIds: selectedTopicIds
            })}
            className="py-3 px-5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-black text-xs sm:text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Target className="w-4 h-4" />
            <span>Свой экзамен (20 вопросов) 🎯</span>
          </button>

          <button
            onClick={() => setExamModalConfig({
              isOpen: true,
              level: 'A1',
              examType: 'level_mastery',
              topicIds: []
            })}
            className="py-3 px-5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black text-xs sm:text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Trophy className="w-4 h-4 text-yellow-200" />
            <span>Итоговый экзамен A1 (30 вопросов) 🏆</span>
          </button>
        </div>

        {/* EXPANDABLE TOPIC SELECTOR */}
        {showTopicSelector && (
          <div className="pt-3 border-t border-purple-100 dark:border-gray-700 space-y-3 animate-fadeIn">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по темам..."
                className="w-full sm:w-64 px-3 py-1.5 rounded-xl border border-purple-200 dark:border-gray-600 dark:bg-gray-750 text-xs font-semibold text-gray-900 dark:text-white focus:outline-none"
              />

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={handleSelectFirstFour}
                  className="text-xs px-2.5 py-1 rounded-lg bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-bold hover:bg-purple-200"
                >
                  Первые 4 темы
                </button>
                <button
                  onClick={handleSelectAllA1}
                  className="text-xs px-2.5 py-1 rounded-lg bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-bold hover:bg-purple-200"
                >
                  Выбрать все ({availableTopics.length})
                </button>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-1">
              {filteredTopics.map((t) => {
                const isSelected = selectedTopicIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTopic(t.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2 text-xs font-semibold ${
                      isSelected
                        ? 'bg-purple-100 dark:bg-purple-900/60 border-purple-500 text-purple-900 dark:text-purple-200 shadow-sm font-bold'
                        : 'bg-white dark:bg-gray-750 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-purple-300'
                    }`}
                  >
                    <span className="truncate">{t.id}. {t.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 2. ACTIVE EXERCISE QUESTION CARD */}
      {loading ? (
        <div className="p-12 text-center text-purple-600 font-bold">
          Загрузка упражнений...
        </div>
      ) : !currentEx ? (
        <div className="max-w-3xl mx-auto p-8 text-center rounded-3xl bg-white dark:bg-gray-800 border border-purple-100 dark:border-gray-700 shadow-lg">
          <p className="font-bold text-gray-800 dark:text-gray-100">{error || 'Пока нет сгенерированных упражнений.'}</p>
          <button
            onClick={() => fetchExercises(selectedTopicIds, true)}
            className="mt-4 px-6 py-2.5 rounded-xl bg-purple-600 text-white font-bold text-xs"
          >
            Сгенерировать вопросы через ИИ ⚡
          </button>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto glass-card rounded-3xl p-6 sm:p-10 shadow-2xl border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-purple-100 dark:border-gray-700 pb-4 mb-6">
            <div>
              <span className="text-xs font-bold bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2.5 py-1 rounded-full">
                {currentEx.level} • {currentEx.topic}
              </span>
              <h3 className="text-lg font-extrabold text-gray-900 dark:text-white mt-1">
                {isChoice ? 'Тест с выбором ответа' : 'Ответ на испанском'}
              </h3>
            </div>
            <div className="text-sm font-bold text-purple-600 dark:text-purple-400">
              {currentIndex + 1} / {exercises.length}
            </div>
          </div>

          <p className="text-lg font-bold text-gray-900 dark:text-white mb-6">
            {currentEx.question}
          </p>

          {isChoice && (
            <div className="space-y-3 mb-6">
              {(currentEx.options || []).map((opt, idx) => {
                let btnStyle = 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:border-purple-400';
                if (isAnswered) {
                  if (opt.toLowerCase() === (result?.correctAnswer || currentEx.correctAnswer || '').toLowerCase()) {
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

          {!isChoice && (
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

          {error && (
            <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm font-semibold mb-4">{error}</div>
          )}

          {isAnswered && (
            <div className={`p-4 rounded-xl font-bold text-sm mb-6 ${result?.isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              <div>
                {result?.isCorrect ? '¡Excelente! Ответ правильный.' : `Неверно. Правильный ответ: ${result?.correctAnswer || currentEx.correctAnswer}`}
              </div>
              {(result?.explanation || currentEx.explanation) && (
                <div className="mt-2 font-medium opacity-90">{result?.explanation || currentEx.explanation}</div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            {!isAnswered ? (
              <button
                onClick={handleCheck}
                disabled={checking || !userAnswer}
                className="px-6 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold rounded-xl shadow disabled:opacity-50"
              >
                {checking ? 'Проверяем…' : t('btn_check', 'Проверить')}
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
      )}

      {/* 3. EXAM MODAL LAUNCHER */}
      <ExamModal
        isOpen={examModalConfig.isOpen}
        level={examModalConfig.level}
        examType={examModalConfig.examType}
        topicIds={examModalConfig.topicIds}
        onClose={() => setExamModalConfig(prev => ({ ...prev, isOpen: false }))}
        onExamFinished={(res) => {
          window.dispatchEvent(new CustomEvent('gamification_updated'));
        }}
      />
    </div>
  );
}

// ----------------------------------------------------
// MAIN EXERCISES HUB
// ----------------------------------------------------
export default function Exercises() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const validTabs = ['translation', 'classic_quiz', 'verb_drills', 'word_tiles', 'speed_match', 'error_detective'];
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(validTabs.includes(tabParam) ? tabParam : 'classic_quiz');
  const recommendedMode = searchParams.get('mode') === 'recommended';
  const topicIds = (searchParams.get('topicIds') || '')
    .split(',')
    .map(Number)
    .filter((topicId) => Number.isInteger(topicId) && topicId > 0)
    .slice(0, 5);

  useEffect(() => {
    if (validTabs.includes(tabParam)) setActiveTab(tabParam);
  }, [tabParam]);

  const tabs = [
    { id: 'translation', label: 'Перевод предложений', emoji: '🌐' },
    { id: 'classic_quiz', label: 'Тесты & Экзамены (ИИ)', emoji: '🧠' },
    { id: 'verb_drills', label: 'Спряжения глаголов', emoji: '🎯' },
    { id: 'word_tiles', label: 'Конструктор фраз', emoji: '🧩' },
    { id: 'speed_match', label: 'Speed Match Blitz', emoji: '⚡' },
    { id: 'error_detective', label: 'Детектив ошибок', emoji: '🔍' },
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

      {recommendedMode && activeTab === 'classic_quiz' && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100">
          <div className="font-black text-sm">Рекомендованное повторение</div>
          <div className="text-xs sm:text-sm mt-1">Здесь только темы, с которыми вы уже познакомились и которым сейчас нужна практика.</div>
        </div>
      )}

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

      {activeTab === 'translation' && <SentenceTranslationExerciseSection />}
      {activeTab === 'word_tiles' && <WordTilesSection />}
      {activeTab === 'speed_match' && <SpeedMatchSection />}
      {activeTab === 'error_detective' && <ErrorDetectiveSection />}
      {activeTab === 'verb_drills' && <VerbConjugationDrills />}
      {activeTab === 'classic_quiz' && <ClassicQuizSection topicIds={topicIds} />}
    </div>
  );
}
