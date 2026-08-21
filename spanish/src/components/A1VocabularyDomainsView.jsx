import React, { useState, useEffect } from 'react';
import {
  BookMarked, Search, Volume2, CheckCircle2, ShieldCheck,
  Layers, ChevronRight, Loader2, Sparkles, Filter, Info
} from 'lucide-react';
import { profileApiUrl, profileFetch } from '../utils/api';
import { soundEngine, speakSpanish } from '../utils/soundEffects';
import { useLanguage } from '../contexts/LanguageContext';

export default function A1VocabularyDomainsView() {
  const { t, language } = useLanguage();
  const [domainStats, setDomainStats] = useState(null);
  const [selectedDomain, setSelectedDomain] = useState('identity');
  const [words, setWords] = useState([]);
  const [loadingWords, setLoadingWords] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchDomains = async () => {
    try {
      const res = await profileFetch(profileApiUrl('/spanish/api/a1/vocabulary/domains'));
      if (res.ok) {
        const data = await res.json();
        setDomainStats(data.vocabulary || null);
      }
    } catch (err) {
      console.error('Error fetching vocabulary domains:', err);
    }
  };

  const fetchDomainWords = async (domainId) => {
    try {
      setLoadingWords(true);
      const res = await profileFetch(profileApiUrl(`/spanish/api/a1/vocabulary/domain/${domainId}`));
      if (res.ok) {
        const data = await res.json();
        setWords(data.words || []);
      }
    } catch (err) {
      console.error('Error fetching domain words:', err);
    } finally {
      setLoadingWords(false);
    }
  };

  useEffect(() => {
    fetchDomains();
  }, []);

  useEffect(() => {
    if (selectedDomain) {
      fetchDomainWords(selectedDomain);
    }
  }, [selectedDomain]);

  const filteredWords = words.filter(w => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    return w.word.toLowerCase().includes(q) || w.translation.toLowerCase().includes(q);
  });

  const domainsList = domainStats?.domains || [];
  const currentDomainMeta = domainsList.find(d => d.id === selectedDomain);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-600 via-emerald-600 to-green-600 text-white rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BookMarked className="w-8 h-8 text-amber-300 flex-shrink-0" />
            <div>
              <h2 className="text-xl sm:text-2xl font-black">
                650 Базовых лемм испанского A1
              </h2>
              <p className="text-xs sm:text-sm text-teal-100 mt-1">
                Точное распределение по 12 коммуникативным доменам с примерами, родом и произношением.
              </p>
            </div>
          </div>

          <div className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-2xl text-center self-start sm:self-auto">
            <div className="text-xs uppercase font-bold text-teal-100">Общее покрытие</div>
            <div className="text-lg sm:text-xl font-black">
              {domainStats?.introduced || 650} / {domainStats?.target || 650} лемм
            </div>
          </div>
        </div>
      </div>

      {/* Domain Cards Carousel / Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {domainsList.map((dom) => {
          const isSelected = dom.id === selectedDomain;
          return (
            <button
              key={dom.id}
              onClick={() => setSelectedDomain(dom.id)}
              className={`p-3.5 rounded-2xl border text-left transition-all shadow-sm flex flex-col justify-between ${
                isSelected
                  ? 'bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white border-purple-500 shadow-md scale-[1.02]'
                  : 'bg-white dark:bg-gray-800 border-purple-100 dark:border-gray-700 hover:border-purple-300 text-gray-800 dark:text-gray-200'
              }`}
            >
              <div>
                <div className={`text-[10px] font-bold uppercase tracking-wider ${isSelected ? 'text-purple-200' : 'text-gray-400'}`}>
                  {dom.id}
                </div>
                <div className="font-extrabold text-xs sm:text-sm mt-0.5 line-clamp-1">
                  {dom.titleRu}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-xs">
                <span className={`font-black ${isSelected ? 'text-white' : 'text-purple-600 dark:text-purple-400'}`}>
                  {dom.target} слов
                </span>
                <span className={`text-[11px] ${isSelected ? 'text-purple-200' : 'text-gray-400'}`}>
                  {dom.mature} зрелых
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Words Table & Filter */}
      <div className="glass-card rounded-3xl p-5 sm:p-7 border border-purple-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-extrabold text-gray-900 dark:text-white">
              {currentDomainMeta?.titleRu || selectedDomain} ({filteredWords.length} слов)
            </h3>
            <div className="text-xs text-gray-500">
              Модуль: {currentDomainMeta?.unitId || 'A1'}
            </div>
          </div>

          <div className="relative min-w-[220px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Поиск слова или перевода..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-gray-50 dark:bg-gray-750 border border-purple-200 dark:border-gray-700 text-xs font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {loadingWords ? (
          <div className="text-center py-12 text-purple-600">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
            <span className="text-xs font-semibold">Загрузка слов...</span>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-purple-50 dark:border-gray-700">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-purple-50 dark:bg-gray-750 text-purple-900 dark:text-purple-200 font-bold">
                <tr>
                  <th className="p-3">Слово (Испанский)</th>
                  <th className="p-3">Перевод (Русский)</th>
                  <th className="p-3 hidden md:table-cell">Часть речи / Род</th>
                  <th className="p-3 hidden sm:table-cell">Пример употребления A1</th>
                  <th className="p-3 text-center">Аудио</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-50 dark:divide-gray-700 bg-white dark:bg-gray-850">
                {filteredWords.map((w, idx) => (
                  <tr key={idx} className="hover:bg-purple-50/40 dark:hover:bg-gray-800 transition-colors">
                    <td className="p-3 font-extrabold text-gray-900 dark:text-white">
                      {w.word}
                    </td>
                    <td className="p-3 text-gray-700 dark:text-gray-300 font-medium">
                      {w.translation}
                    </td>
                    <td className="p-3 text-gray-500 text-xs hidden md:table-cell">
                      <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-750 text-gray-600 dark:text-gray-400 font-bold">
                        {w.part_of_speech}{w.gender ? ` (${w.gender})` : ''}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-gray-600 dark:text-gray-400 hidden sm:table-cell">
                      <div className="italic text-gray-800 dark:text-gray-200">{w.example}</div>
                      <div className="text-[11px] text-gray-500">{w.example_translation}</div>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => speakSpanish(w.word)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-gray-700 transition-colors"
                        title="Прослушать"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
