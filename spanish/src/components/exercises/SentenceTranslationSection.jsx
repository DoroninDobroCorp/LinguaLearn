import React, { useState, useEffect } from 'react';
import { 
  Globe, Sparkles, RefreshCw, Volume2, HelpCircle, ArrowRight, ArrowLeft, 
  Shuffle, ListOrdered, Check, RotateCcw, Package, Download, Wifi, CheckCircle2, Zap 
} from 'lucide-react';
import { profileApiUrl, profileFetch } from '../../utils/api';
import { soundEngine, speakSpanish } from '../../utils/soundEffects';
import DEFAULT_A1_PACK from '../../utils/a1First18OfflinePack.json';

const OFFLINE_PACK_STORAGE_KEY = 'lingua_spanish_offline_translation_pack_100';
const OFFLINE_PACK_INDEX_KEY = 'lingua_spanish_offline_pack_index';

function normalizeSentence(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[¿?¡!.,;:«»"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripAccents(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function checkGrammarAnswerMatch(userText, correctText, altAnswers = []) {
  const normUser = normalizeSentence(userText);
  const normCorrect = normalizeSentence(correctText);
  if (normUser === normCorrect) return true;
  if (stripAccents(normUser) === stripAccents(normCorrect)) return true;

  if (Array.isArray(altAnswers)) {
    for (const alt of altAnswers) {
      if (normalizeSentence(alt) === normUser) return true;
      if (stripAccents(normalizeSentence(alt)) === stripAccents(normUser)) return true;
    }
  }

  return false;
}

function loadInitialPack() {
  try {
    const saved = localStorage.getItem(OFFLINE_PACK_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.exercises) && parsed.exercises.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Error reading saved offline pack:', e);
  }

  // Fallback to bundled 100-sentence pack and seed localStorage
  try {
    if (DEFAULT_A1_PACK && Array.isArray(DEFAULT_A1_PACK.exercises) && DEFAULT_A1_PACK.exercises.length > 0) {
      localStorage.setItem(OFFLINE_PACK_STORAGE_KEY, JSON.stringify(DEFAULT_A1_PACK));
      return DEFAULT_A1_PACK;
    }
  } catch (e) {}

  return null;
}

export default function SentenceTranslationSection() {
  const [topics, setTopics] = useState([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState(() => {
    try {
      const saved = localStorage.getItem('lingua_spanish_translation_topics');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    // Default to first 18 topics of A1
    return [27, 7, 19, 4, 5, 20, 6, 1, 13, 30, 21, 8, 11, 25, 2, 17, 18, 22];
  });
  const [showTopicSelector, setShowTopicSelector] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState(() => {
    try {
      return localStorage.getItem('lingua_spanish_translation_level') || 'all';
    } catch {
      return 'all';
    }
  });

  // Practice Mode: 'pack100' (offline 100-sentence pack) or 'live10' (on-demand 10 sentences)
  const [practiceMode, setPracticeMode] = useState(() => {
    try {
      return localStorage.getItem('lingua_spanish_translation_mode') || 'pack100';
    } catch {
      return 'pack100';
    }
  });

  // Offline Pack Data
  const [packData, setPackData] = useState(() => loadInitialPack());
  const [packIndex, setPackIndex] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(OFFLINE_PACK_INDEX_KEY));
      return Number.isInteger(saved) && saved >= 0 ? saved : 0;
    } catch {
      return 0;
    }
  });

  // Live 10 exercises
  const [liveExercises, setLiveExercises] = useState([]);
  const [liveIndex, setLiveIndex] = useState(0);

  const [loading, setLoading] = useState(false);
  const [packGenerating, setPackGenerating] = useState(false);
  const [userTranslation, setUserTranslation] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [notice, setNotice] = useState('');

  // Active list & index depending on mode
  const currentExercises = practiceMode === 'pack100' ? (packData?.exercises || []) : liveExercises;
  const currentIndex = practiceMode === 'pack100' ? packIndex : liveIndex;
  const current = currentExercises[currentIndex] || null;

  useEffect(() => {
    try {
      if (selectedTopicIds.length > 0) {
        localStorage.setItem('lingua_spanish_translation_topics', JSON.stringify(selectedTopicIds));
      }
    } catch {}
  }, [selectedTopicIds]);

  useEffect(() => {
    try {
      localStorage.setItem('lingua_spanish_translation_level', selectedLevel);
    } catch {}
  }, [selectedLevel]);

  useEffect(() => {
    try {
      localStorage.setItem('lingua_spanish_translation_mode', practiceMode);
    } catch {}
  }, [practiceMode]);

  useEffect(() => {
    try {
      localStorage.setItem(OFFLINE_PACK_INDEX_KEY, String(packIndex));
    } catch {}
  }, [packIndex]);

  // Load topics
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

  // Filter topics
  const filteredTopics = topics.filter(t => {
    const matchesLevel = selectedLevel === 'all' || t.level === selectedLevel;
    const matchesSearch = !searchQuery.trim() || t.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  const toggleTopic = (id) => {
    setSelectedTopicIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectFirst18 = () => {
    const a1Topics = topics.filter(t => t.level === 'A1');
    const first18 = a1Topics.slice(0, 18).map(t => t.id);
    setSelectedTopicIds(first18.length > 0 ? first18 : [27, 7, 19, 4, 5, 20, 6, 1, 13, 30, 21, 8, 11, 25, 2, 17, 18, 22]);
  };

  const handleSelectAll = () => {
    const currentFilteredIds = filteredTopics.map(t => t.id);
    const allSelected = currentFilteredIds.length > 0 && currentFilteredIds.every(id => selectedTopicIds.includes(id));
    if (allSelected) {
      setSelectedTopicIds(prev => prev.filter(id => !currentFilteredIds.includes(id)));
    } else {
      setSelectedTopicIds(prev => Array.from(new Set([...prev, ...currentFilteredIds])));
    }
  };

  // Generate 10-sentence on-demand practice
  const fetchLive10 = async (targetTopicIds = selectedTopicIds) => {
    setLoading(true);
    setShowResult(false);
    setUserTranslation('');
    setShowHint(false);
    setLiveIndex(0);

    try {
      const res = await profileFetch(profileApiUrl('/spanish/api/exercises/generate-translation'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: selectedLevel !== 'all' ? selectedLevel : undefined,
          topicIds: targetTopicIds.length > 0 ? targetTopicIds : undefined
        })
      });
      const data = await res.json();
      setLiveExercises(data.exercises || []);
      setPracticeMode('live10');
    } catch (err) {
      console.error('Error generating translations:', err);
      setNotice('Ошибка генерации предложений. Проверьте подключение к сети.');
    } finally {
      setLoading(false);
    }
  };

  // Generate 100-sentence offline pack across selected topics
  const generateNew100Pack = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setNotice('Для генерации нового офлайн-пака через нейросеть требуется подключение к интернету. Текущие 100 предложений доступны офлайн!');
      return;
    }

    setPackGenerating(true);
    setNotice('Генерация 100 разнообразных предложений через ИИ... Это займет около 20–30 секунд.');
    setShowTopicSelector(false);

    try {
      const res = await profileFetch(profileApiUrl('/spanish/api/exercises/generate-translation-pack'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicIds: selectedTopicIds.length > 0 ? selectedTopicIds : undefined,
          level: selectedLevel !== 'all' ? selectedLevel : 'A1',
          count: 100
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate pack');
      }

      const data = await res.json();
      const newPack = {
        packId: data.packId || `pack_${Date.now()}`,
        title: `Офлайн-пак: ${data.topics?.length || selectedTopicIds.length} тем (${data.count} предложений)`,
        description: `Сгенерировано: ${new Date().toLocaleDateString()}`,
        totalCount: data.exercises.length,
        generatedAt: data.generatedAt || new Date().toISOString(),
        topics: data.topics || [],
        exercises: data.exercises
      };

      localStorage.setItem(OFFLINE_PACK_STORAGE_KEY, JSON.stringify(newPack));
      setPackData(newPack);
      setPackIndex(0);
      setPracticeMode('pack100');
      setShowResult(false);
      setUserTranslation('');
      setNotice('✓ Новый набор из 100 предложений успешно сохранен в память устройства и готов для практики в офлайне!');
      setTimeout(() => setNotice(''), 6000);
    } catch (err) {
      console.error('Error generating 100-pack:', err);
      setNotice(`Ошибка генерации: ${err.message || 'Попробуйте еще раз через несколько секунд'}`);
    } finally {
      setPackGenerating(false);
    }
  };

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

    // Persist mistake in grammar memory if online
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        if (!match) {
          profileFetch(profileApiUrl('/spanish/api/exercises/record-mistake'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topicName: current.testedGrammar || 'Перевод предложений',
              category: 'translation',
              level: selectedLevel !== 'all' ? selectedLevel : 'A1',
              prompt: current.sourceSentence,
              userWrongAnswer: userTranslation.trim(),
              correctAnswer: current.targetSentence,
              ruleExplanation: current.explanation || ''
            })
          }).catch(() => {});
        } else {
          profileFetch(profileApiUrl('/spanish/api/exercises/resolve-mistake'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              category: 'translation',
              prompt: current.sourceSentence
            })
          }).catch(() => {});
        }
      }
    } catch (e) {}
  };

  const handleNext = () => {
    if (currentIndex + 1 < currentExercises.length) {
      if (practiceMode === 'pack100') {
        setPackIndex(prev => prev + 1);
      } else {
        setLiveIndex(prev => prev + 1);
      }
      setUserTranslation('');
      setShowResult(false);
      setShowHint(false);
    } else {
      if (practiceMode === 'pack100') {
        setPackIndex(0);
        setNotice('🎉 Поздравляем! Вы прошли все 100 предложений офлайн-пака!');
      } else {
        setLiveExercises([]);
        setLiveIndex(0);
      }
      setUserTranslation('');
      setShowResult(false);
      setShowHint(false);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      if (practiceMode === 'pack100') {
        setPackIndex(prev => prev - 1);
      } else {
        setLiveIndex(prev => prev - 1);
      }
      setUserTranslation('');
      setShowResult(false);
      setShowHint(false);
    }
  };

  const handleRandom = () => {
    if (currentExercises.length > 1) {
      let nextIdx = Math.floor(Math.random() * currentExercises.length);
      if (nextIdx === currentIndex) {
        nextIdx = (nextIdx + 1) % currentExercises.length;
      }
      if (practiceMode === 'pack100') setPackIndex(nextIdx);
      else setLiveIndex(nextIdx);
      setUserTranslation('');
      setShowResult(false);
      setShowHint(false);
    }
  };

  const handleResetToBeginning = () => {
    if (practiceMode === 'pack100') setPackIndex(0);
    else setLiveIndex(0);
    setUserTranslation('');
    setShowResult(false);
    setShowHint(false);
  };

  const progressPercent = currentExercises.length > 0 
    ? Math.round(((currentIndex + 1) / currentExercises.length) * 100) 
    : 0;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* 1. Mode Switcher & Pack Header Card */}
      <div className="max-w-4xl mx-auto p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-purple-50 via-white to-fuchsia-50 dark:from-gray-800 dark:via-gray-800 dark:to-purple-950/30 border-2 border-purple-200 dark:border-gray-700 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="p-2 rounded-xl bg-purple-600 text-white font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-sm">
                <Globe className="w-4 h-4" />
                Перевод предложений
              </span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 text-xs font-extrabold flex items-center gap-1">
                <Wifi className="w-3 h-3" />
                Офлайн 100%
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Практика живого перевода с русского на испанский. Пакет хранится в памяти устройства и работает без интернета.
            </p>
          </div>

          {/* Mode Selector */}
          <div className="flex items-center gap-1.5 p-1 bg-purple-100/70 dark:bg-gray-700/70 rounded-2xl border border-purple-200 dark:border-gray-600 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setPracticeMode('pack100')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                practiceMode === 'pack100'
                  ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-purple-600'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Офлайн-пак (100)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (liveExercises.length === 0) fetchLive10();
                else setPracticeMode('live10');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                practiceMode === 'live10'
                  ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-purple-600'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Быстрая (10)</span>
            </button>
          </div>
        </div>

        {/* Notice banner */}
        {notice && (
          <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs font-bold flex items-center justify-between animate-fadeIn">
            <span>{notice}</span>
            <button onClick={() => setNotice('')} className="ml-2 text-amber-500 hover:text-amber-800 font-bold">×</button>
          </div>
        )}

        {/* Topic Selector Expand Button & Level */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-purple-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTopicSelector(!showTopicSelector)}
              className="px-3.5 py-2 rounded-xl border border-purple-300 dark:border-gray-600 bg-white dark:bg-gray-750 text-purple-700 dark:text-purple-300 font-bold text-xs hover:bg-purple-50 transition-all flex items-center gap-1.5 shadow-xs"
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>{showTopicSelector ? 'Скрыть выбор тем ▲' : `Выбрать темы для нового набора (${selectedTopicIds.length}) ▼`}</span>
            </button>

            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="px-2.5 py-2 rounded-xl bg-white dark:bg-gray-750 border border-purple-300 dark:border-gray-600 text-purple-700 dark:text-purple-300 font-bold text-xs focus:outline-none"
            >
              <option value="all">🌍 Все уровни</option>
              {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((lvl) => (
                <option key={lvl} value={lvl}>Уровень {lvl}</option>
              ))}
            </select>
          </div>

          <button
            onClick={generateNew100Pack}
            disabled={packGenerating}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-bold text-xs shadow-md active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
            <span>{packGenerating ? 'Генерация 100 предложений...' : '✨ Сгенерировать новый набор 100'}</span>
          </button>
        </div>

        {/* Expandable Topic Selector */}
        {showTopicSelector && (
          <div className="pt-3 border-t border-purple-100 dark:border-gray-700 space-y-3 animate-fadeIn">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск тем..."
                className="w-full sm:w-64 px-3 py-1.5 rounded-xl border border-purple-200 dark:border-gray-600 dark:bg-gray-750 text-xs font-semibold text-gray-900 dark:text-white focus:outline-none"
              />

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleSelectFirst18}
                  className="text-xs px-2.5 py-1 rounded-lg bg-fuchsia-100 dark:bg-fuchsia-900/50 text-fuchsia-800 dark:text-fuchsia-200 font-black hover:bg-fuchsia-200"
                >
                  Все 18 тем A1
                </button>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xs px-2.5 py-1 rounded-lg bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-bold hover:bg-purple-200"
                >
                  {filteredTopics.length > 0 && filteredTopics.every(t => selectedTopicIds.includes(t.id)) ? 'Снять все' : `Выбрать все (${filteredTopics.length})`}
                </button>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-1">
              {filteredTopics.map((t) => {
                const isSelected = selectedTopicIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTopic(t.id)}
                    className={`p-2 rounded-xl border text-left transition-all flex items-center justify-between gap-2 text-xs font-semibold ${
                      isSelected
                        ? 'bg-purple-100 dark:bg-purple-900/60 border-purple-500 text-purple-900 dark:text-purple-200 shadow-xs font-bold'
                        : 'bg-white dark:bg-gray-750 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-purple-300'
                    }`}
                  >
                    <span className="truncate">{t.pedagogical_order || t.id}. {t.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 2. Loading State */}
      {(loading || packGenerating) ? (
        <div className="max-w-4xl mx-auto py-16 text-center space-y-4 glass-card rounded-3xl p-8 bg-white/90 dark:bg-gray-800/90 shadow-xl border border-purple-100 dark:border-gray-700">
          <RefreshCw className="h-10 w-10 text-purple-600 animate-spin mx-auto" />
          <h3 className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
            {packGenerating ? 'Нейросеть генерирует 100 предложений...' : 'Подготовка предложений...'}
          </h3>
          <p className="text-xs sm:text-sm text-gray-500 max-w-md mx-auto">
            {packGenerating 
              ? 'Создаем разнообразные упражнения по выбранным темам: диалоги, отрицания, вопросы и согласования. Набор сразу сохранится в память телефона.' 
              : 'Составляем задачи на основе грамматики и вашего словаря...'}
          </p>
        </div>
      ) : current ? (
        /* 3. Interactive Exercise Card */
        <div className="max-w-4xl mx-auto glass-card rounded-3xl p-5 sm:p-8 shadow-2xl border border-purple-100 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 animate-fadeIn space-y-5">
          {/* Card Top: Progress & Controls */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-xl bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 font-extrabold">
                  {practiceMode === 'pack100' ? 'Офлайн-пак' : 'Быстрая'}: {currentIndex + 1} из {currentExercises.length}
                </span>
                <span className="text-[11px] text-gray-400">({progressPercent}%)</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  className="p-1.5 rounded-lg border border-purple-200 dark:border-gray-700 bg-white dark:bg-gray-750 text-gray-700 dark:text-gray-200 disabled:opacity-30 hover:bg-purple-50"
                  title="Предыдущее предложение"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleRandom}
                  className="p-1.5 rounded-lg border border-purple-200 dark:border-gray-700 bg-white dark:bg-gray-750 text-gray-700 dark:text-gray-200 hover:bg-purple-50"
                  title="Случайное предложение"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={currentIndex >= currentExercises.length - 1}
                  className="p-1.5 rounded-lg border border-purple-200 dark:border-gray-700 bg-white dark:bg-gray-750 text-gray-700 dark:text-gray-200 disabled:opacity-30 hover:bg-purple-50"
                  title="Следующее предложение"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-purple-100 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-purple-500 to-fuchsia-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Grammar Topic Pill */}
          <div className="flex items-center justify-between text-xs font-bold text-gray-500 dark:text-gray-400">
            <span className="px-2.5 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
              📌 {current.testedGrammar || 'Грамматика темы'}
            </span>
            {current.isReview && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-black">
                <RotateCcw className="w-3 h-3 text-amber-700" />
                <span>Повторение темы</span>
              </span>
            )}
          </div>

          {/* Target Prompt Box */}
          <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/40 dark:to-pink-950/40 border border-purple-200 dark:border-purple-800 space-y-1.5">
            <span className="text-xs font-extrabold uppercase tracking-wider text-purple-700 dark:text-purple-300 block">
              Переведите на испанский:
            </span>
            <p className="text-lg sm:text-xl font-black text-gray-900 dark:text-white leading-snug">
              {current.sourceSentence}
            </p>
          </div>

          {/* User Input Textarea */}
          <div className="space-y-2">
            <textarea
              rows="3"
              value={userTranslation}
              onChange={(e) => setUserTranslation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), !showResult ? handleCheck() : handleNext())}
              placeholder="Escribe la traducción en español..."
              disabled={showResult}
              className="w-full p-4 rounded-2xl border-2 border-purple-200 dark:border-gray-600 dark:bg-gray-750 focus:border-purple-600 focus:outline-none text-base font-bold text-gray-900 dark:text-white"
            />
            {current.hint && (
              <button
                type="button"
                onClick={() => setShowHint(!showHint)}
                className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span>{showHint ? `Подсказка: ${current.hint}` : 'Показать подсказку'}</span>
              </button>
            )}
          </div>

          {/* Result Box */}
          {showResult && (
            <div className={`p-4 sm:p-5 rounded-2xl border space-y-2.5 animate-fadeIn ${
              isCorrect ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700' : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`font-black text-sm ${isCorrect ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300'}`}>
                  {isCorrect ? '✅ Отлично! Верный перевод' : '❌ Эталонный перевод:'}
                </span>
                <button
                  type="button"
                  onClick={() => speakSpanish(current.targetSentence)}
                  className="p-1.5 rounded-xl bg-white dark:bg-gray-750 text-gray-700 dark:text-gray-200 hover:text-purple-600 shadow-xs active:scale-95"
                  title="Озвучить"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
              </div>

              <p className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
                {current.targetSentence}
              </p>

              {/* Alternative answers if any */}
              {Array.isArray(current.alternativeAnswers) && current.alternativeAnswers.length > 0 && (
                <div className="text-xs text-gray-600 dark:text-gray-300 pt-1">
                  <span className="font-bold">Также принимается:</span> {current.alternativeAnswers.join(' • ')}
                </div>
              )}

              {current.explanation && (
                <div className="text-xs text-gray-600 dark:text-gray-400 pt-1 border-t border-gray-200/60 dark:border-gray-700">
                  💡 {current.explanation}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleResetToBeginning}
              className="text-xs font-bold text-gray-500 hover:text-purple-600"
            >
              ↺ В начало
            </button>

            {!showResult ? (
              <button
                onClick={handleCheck}
                disabled={!userTranslation.trim()}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-black rounded-xl shadow-md text-sm active:scale-95 transition-all"
              >
                Проверить перевод
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="px-6 py-3 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-black rounded-xl shadow-lg text-sm flex items-center gap-2 active:scale-95 transition-all"
              >
                <span>{currentIndex + 1 >= currentExercises.length ? 'Завершить круг 🏆' : 'Следующее предложение'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Empty Fallback */
        <div className="max-w-md mx-auto text-center py-12 space-y-4">
          <p className="text-sm text-gray-500">Нет доступных предложений для практики.</p>
          <button
            onClick={() => fetchLive10()}
            className="px-5 py-2.5 rounded-xl bg-purple-600 text-white font-bold text-xs"
          >
            Сгенерировать 10 предложений
          </button>
        </div>
      )}
    </div>
  );
}
