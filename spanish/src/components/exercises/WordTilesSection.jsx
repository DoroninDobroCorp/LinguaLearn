import React, { useState, useEffect } from 'react';
import { Volume2, ArrowRight } from 'lucide-react';
import { profileApiUrl, profileFetch } from '../../utils/api';
import { soundEngine, speakSpanish } from '../../utils/soundEffects';
import { useLanguage } from '../../contexts/LanguageContext';

export default function WordTilesSection() {
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
    return <div className="p-8 text-center text-gray-500">Загрузка конструктора предложений...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto glass-card rounded-3xl p-6 sm:p-10 shadow-2xl border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 animate-fadeIn space-y-6">
      <div className="flex items-center justify-between border-b border-purple-100 dark:border-gray-700 pb-4">
        <div>
          <span className="text-xs font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 px-2.5 py-1 rounded-full">
            {currentItem.level}
          </span>
          <h3 className="text-xl font-extrabold text-gray-900 dark:text-white mt-1 flex items-center gap-2">
            <span>🧩 Word Tiles (Конструктор фраз)</span>
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Соберите предложение на испанском из перемешанных карточек-слов.</p>
        </div>
        <span className="text-sm font-bold text-purple-600 dark:text-purple-400">{currentIndex + 1} / {items.length}</span>
      </div>

      <div className="p-6 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/40 dark:to-pink-950/40 border border-purple-200 dark:border-purple-800 space-y-1">
        <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">Переведите на испанский:</span>
        <p className="text-lg font-bold text-gray-900 dark:text-white leading-snug">{currentItem.prompt}</p>
      </div>

      <div className="min-h-[100px] p-4 rounded-2xl border-2 border-dashed border-purple-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-750 flex flex-wrap items-center gap-2">
        {selectedTiles.length === 0 ? (
          <span className="text-sm text-gray-400 font-medium">Нажимайте на слова внизу, чтобы составить фразу...</span>
        ) : (
          selectedTiles.map((tile) => (
            <button
              key={tile.id}
              onClick={() => handleRemoveTile(tile)}
              disabled={isSubmitted}
              className="px-3.5 py-2 rounded-xl bg-purple-600 text-white font-bold text-sm shadow-md hover:bg-purple-700 active:scale-95 transition-all"
            >
              {tile.text}
            </button>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        {availableTiles.map((tile) => (
          <button
            key={tile.id}
            onClick={() => handleTileClick(tile)}
            disabled={isSubmitted}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 hover:border-purple-400 text-gray-800 dark:text-gray-200 font-semibold text-sm shadow-sm active:scale-95 transition-all"
          >
            {tile.text}
          </button>
        ))}
      </div>

      {isSubmitted && (
        <div className={`p-4 rounded-xl border space-y-2 animate-fadeIn ${
          isCorrect ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700' : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`font-bold text-sm ${isCorrect ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300'}`}>
              {isCorrect ? '✅ Отлично! Предложение собрано верно' : '❌ Правильный вариант:'}
            </span>
            <button
              type="button"
              onClick={() => speakSpanish(currentItem.correctSentence)}
              className="p-1 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:text-purple-600 shadow-sm"
              title="Озвучить"
            >
              <Volume2 className="h-4 w-4" />
            </button>
          </div>
          <p className="text-base font-bold text-gray-900 dark:text-white">{currentItem.correctSentence}</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        {currentItem.hint ? (
          <button
            type="button"
            onClick={() => setShowHint(!showHint)}
            className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline"
          >
            {showHint ? `💡 ${currentItem.hint}` : 'Показать подсказку'}
          </button>
        ) : <div />}

        {!isSubmitted ? (
          <button
            onClick={handleVerify}
            disabled={selectedTiles.length === 0}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold rounded-xl shadow-md text-sm"
          >
            Проверить сборку
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="px-6 py-3 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold rounded-xl shadow-lg text-sm flex items-center gap-2"
          >
            <span>Следующая фраза</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
