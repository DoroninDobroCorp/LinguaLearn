import React, { useState, useEffect } from 'react';
import { 
  X, Layers, Sparkles, BookMarked, Check, Loader2, 
  ArrowRight, FolderPlus, Info
} from 'lucide-react';
import { profileApiUrl, profileFetch } from '../utils/api';
import { useTheme } from '../contexts/ThemeContext';

export default function VocabularyDecksModal({ isOpen, onClose, onDecksCreated }) {
  const { isDark } = useTheme();

  const [catalogs, setCatalogs] = useState([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);
  const [selectedCatalog, setSelectedCatalog] = useState('level_a1');
  const [deckSize, setDeckSize] = useState(25);
  const [generating, setGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchCatalogs();
      setGenerationResult(null);
    }
  }, [isOpen]);

  const fetchCatalogs = async () => {
    setLoadingCatalogs(true);
    try {
      const res = await profileFetch(profileApiUrl('/spanish/api/vocabulary/frequency-catalogs'));
      if (res.ok) {
        const data = await res.json();
        setCatalogs(data.catalogs || []);
        if (data.catalogs?.length > 0) {
          setSelectedCatalog(data.catalogs[0].key);
        }
      }
    } catch (err) {
      console.error('Error fetching frequency catalogs:', err);
    } finally {
      setLoadingCatalogs(false);
    }
  };

  const handleGenerateDecks = async () => {
    setGenerating(true);
    try {
      const res = await profileFetch(profileApiUrl('/spanish/api/vocabulary/generate-decks'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presetKey: selectedCatalog,
          deckSize: Number(deckSize) || 25
        })
      });

      if (res.ok) {
        const data = await res.json();
        setGenerationResult(data);
        if (typeof onDecksCreated === 'function') {
          onDecksCreated(data);
        }
      } else {
        alert('Не удалось сформировать колоды слов.');
      }
    } catch (err) {
      console.error('Error generating decks:', err);
      alert('Ошибка при создании колод.');
    } finally {
      setGenerating(false);
    }
  };

  if (!isOpen) return null;

  const bgModal = isDark ? 'bg-slate-900 text-gray-100' : 'bg-white text-gray-800';
  const cardBg = isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200';
  const borderCol = isDark ? 'border-slate-700' : 'border-gray-200';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in overflow-hidden">
      <div className={`relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border ${borderCol} ${bgModal}`}>
        
        {/* Header */}
        <div className={`flex items-center justify-between p-4 sm:p-5 border-b ${borderCol} flex-shrink-0`}>
          <div className="flex items-center space-x-3">
            <span className="p-2 rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white shadow-md">
              <Layers className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                Автоматические колоды частотных слов
              </h2>
              <p className="text-xs text-gray-400">
                Нарезка частотного словаря на удобные пачки по 20–30 слов для пошагового изучения
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-slate-700/60 transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {generationResult ? (
            /* Success State */
            <div className="p-6 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 text-center space-y-4 animate-fade-in">
              <div className="inline-flex p-3 rounded-full bg-emerald-500/20 text-emerald-400">
                <Check className="h-8 w-8" />
              </div>

              <h3 className="text-xl font-bold text-gray-100">
                🎉 Колоды успешно созданы и добавлены в ваш словарь!
              </h3>

              <p className="text-sm text-gray-300">
                Создано групп: <span className="font-bold text-emerald-400">{generationResult.totalGroupsCreated}</span> | 
                Слов добавлено: <span className="font-bold text-emerald-400">{generationResult.totalWordsAdded}</span>
              </p>

              <div className="max-h-48 overflow-y-auto space-y-2 text-left pt-2">
                {generationResult.groups?.map((g) => (
                  <div key={g.id} className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-700/60 flex items-center justify-between text-xs sm:text-sm">
                    <span className="font-medium text-gray-200">{g.name}</span>
                    <span className="px-2 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-400 font-bold text-xs">
                      {g.wordCount} слов
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm shadow-lg hover:from-emerald-600 hover:to-teal-700 transition-all"
                >
                  Перейти к изучению карточек
                </button>
              </div>
            </div>
          ) : (
            /* Config State */
            <div className="space-y-5">
              <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-start space-x-3 text-xs sm:text-sm text-purple-300">
                <Info className="h-5 w-5 text-purple-400 mt-0.5 flex-shrink-0" />
                <p>
                  Выберите частотный каталог слов по уровню CEFR. Система автоматически разобьет выбранный список на порционные группы (колоды) по 25 слов и привяжет их к интервальному повторению.
                </p>
              </div>

              {/* Catalogs Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Выберите частотный каталог:
                </label>

                {loadingCatalogs ? (
                  <div className="flex items-center justify-center py-6 space-x-2 text-gray-400 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-fuchsia-500" />
                    <span>Загрузка каталогов...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5">
                    {catalogs.map((cat) => {
                      const isSelected = selectedCatalog === cat.key;
                      return (
                        <button
                          key={cat.key}
                          onClick={() => setSelectedCatalog(cat.key)}
                          className={`w-full p-4 rounded-xl text-left border transition-all flex items-center justify-between ${
                            isSelected
                              ? 'bg-fuchsia-600/20 border-fuchsia-500 shadow-md'
                              : 'bg-slate-900/60 border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-800 text-fuchsia-400 border border-slate-700">
                                {cat.level}
                              </span>
                              <span className="font-bold text-sm text-gray-100">{cat.title}</span>
                            </div>
                            <p className="text-xs text-gray-400">{cat.description}</p>
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            <span className="text-xs font-semibold text-purple-400">
                              {cat.totalWords} слов
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Deck Size Picker */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Размер одной колоды (слов в группе):
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[20, 25, 30].map((size) => (
                    <button
                      key={size}
                      onClick={() => setDeckSize(size)}
                      className={`py-3 px-4 rounded-xl border text-sm font-bold transition-all ${
                        deckSize === size
                          ? 'bg-gradient-to-r from-fuchsia-600 to-purple-600 border-fuchsia-500 text-white shadow-lg'
                          : 'bg-slate-900/60 border-slate-700 text-gray-300 hover:bg-slate-800'
                      }`}
                    >
                      {size} слов
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!generationResult && (
          <div className={`p-4 border-t ${borderCol} bg-slate-900/80 flex-shrink-0 flex items-center justify-between`}>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-gray-400 hover:text-white transition-all"
            >
              Отмена
            </button>

            <button
              onClick={handleGenerateDecks}
              disabled={generating}
              className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold text-sm shadow-lg hover:from-fuchsia-600 hover:to-purple-700 transition-all disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
              <span>Сформировать колоды</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
