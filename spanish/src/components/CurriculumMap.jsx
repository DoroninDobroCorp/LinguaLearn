import React, { useState, useEffect } from 'react';
import {
  ChevronDown, ChevronRight, CheckCircle2, Circle,
  TrendingUp, Filter, Map, Sparkles, Trophy, Award, GraduationCap, Compass,
  BookOpen, Layers, ShieldCheck
} from 'lucide-react';
import { profileApiUrl, profileFetch } from '../utils/api';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import TopicTheoryModal from './TopicTheoryModal';
import ExamModal from './ExamModal';
import A1AdventureMap from './A1AdventureMap';

const LEVEL_CONFIG = {
  'A1': { label: 'Principiante / Начальный', emoji: '📗', gradient: 'from-green-400 to-green-500' },
  'A2': { label: 'Elemental / Элементарный', emoji: '📗', gradient: 'from-emerald-400 to-teal-500' },
  'B1': { label: 'Intermedio / Средний', emoji: '📘', gradient: 'from-blue-400 to-blue-500' },
  'B2': { label: 'Intermedio Alto / Выше среднего', emoji: '📘', gradient: 'from-indigo-400 to-purple-500' },
  'C1': { label: 'Avanzado / Продвинутый', emoji: '📙', gradient: 'from-orange-400 to-amber-500' },
  'C2': { label: 'Dominio / Владение в совершенстве', emoji: '📕', gradient: 'from-red-400 to-rose-500' },
};

function StatusIcon({ status, score, isLocked }) {
  if (isLocked) {
    return <ShieldCheck className="h-5 w-5 text-amber-500 flex-shrink-0" title="Выучено" />;
  }
  if (status === 'mastered') {
    return <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />;
  }
  if (status === 'in_progress') {
    return (
      <div className="relative flex-shrink-0">
        <svg className="h-5 w-5" viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="8" fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
          <circle
            cx="10" cy="10" r="8" fill="none"
            stroke="#f59e0b" strokeWidth="2.5"
            strokeDasharray={`${(score / 100) * 50.3} 50.3`}
            strokeLinecap="round"
            transform="rotate(-90 10 10)"
          />
        </svg>
      </div>
    );
  }
  return <Circle className="h-5 w-5 text-gray-300 flex-shrink-0" />;
}

export default function CurriculumMap() {
  const { isDark } = useTheme();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('all_topics'); // 'all_topics' | 'a1_map'
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedLevels, setExpandedLevels] = useState({ 'A1': true, 'A2': true, 'B1': false, 'B2': false, 'C1': false, 'C2': false });
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  const [selectedTopicId, setSelectedTopicId] = useState(null);
  const [selectedTopicName, setSelectedTopicName] = useState(null);
  const [examLevel, setExamLevel] = useState(null);

  const fetchTopics = async () => {
    try {
      setLoading(true);
      const res = await profileFetch(profileApiUrl('/spanish/api/curriculum/topics'));
      if (res.ok) {
        const data = await res.json();
        setTopics(data.topics || []);
      }
    } catch (error) {
      console.error('Error fetching curriculum topics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTopics();
  }, []);

  const toggleLevel = (level) => {
    setExpandedLevels(prev => ({ ...prev, [level]: !prev[level] }));
  };

  const openTheory = (topic) => {
    setSelectedTopicId(topic.id);
    setSelectedTopicName(topic.name);
  };

  // Group all 158 topics by level
  const groupedByLevel = topics.reduce((acc, topic) => {
    if (!acc[topic.level]) acc[topic.level] = [];
    acc[topic.level].push(topic);
    return acc;
  }, {});

  const totalTopicsCount = topics.length;
  const masteredTotal = topics.filter(t => t.is_locked || t.status === 'mastered' || t.score >= 80).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn space-y-6">
      {/* Title banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gradient flex items-center gap-3">
            <Map className="h-9 w-9 text-fuchsia-500" />
            {t('nav_curriculum', 'Карта учебного плана')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm sm:text-base">
            Все <strong>{totalTopicsCount} тем</strong> испанского языка по уровням CEFR (A1–C2) с теорией, AI-репетитором и экзаменами.
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center space-x-2 bg-white/80 dark:bg-gray-800/80 p-1.5 rounded-2xl border border-purple-200 dark:border-gray-700 shadow-sm">
          <button
            onClick={() => setActiveTab('all_topics')}
            className={`px-4 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center gap-1.5 ${
              activeTab === 'all_topics'
                ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-md'
                : 'text-gray-600 dark:text-gray-400 hover:text-purple-600'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>📋 Каталог всех тем ({totalTopicsCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('a1_map')}
            className={`px-4 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center gap-1.5 ${
              activeTab === 'a1_map'
                ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-md'
                : 'text-gray-600 dark:text-gray-400 hover:text-purple-600'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>🗺️ Маршрут A1 с Матео</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: FULL 158-TOPIC CATALOG (A1 to C2) */}
      {activeTab === 'all_topics' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Filters & Overall Summary */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white/80 dark:bg-gray-800/80 p-4 rounded-3xl border border-purple-100 dark:border-gray-700 shadow-sm">
            <div className="flex items-center space-x-2 text-xs font-bold text-gray-500">
              <Filter className="w-4 h-4 text-purple-600" />
              <span>Фильтр тем:</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-3 py-1.5 bg-gray-50 dark:bg-gray-700 rounded-xl border border-purple-200 dark:border-gray-600 text-xs font-bold text-gray-800 dark:text-white"
              >
                <option value="all">Все категории</option>
                <option value="Grammar">📝 Грамматика</option>
                <option value="Vocabulary">📖 Словарный запас</option>
                <option value="Speaking">🗣️ Разговорная речь</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-1.5 bg-gray-50 dark:bg-gray-700 rounded-xl border border-purple-200 dark:border-gray-600 text-xs font-bold text-gray-800 dark:text-white"
              >
                <option value="all">Все статусы</option>
                <option value="mastered">✓ Освоено (80%+)</option>
                <option value="in_progress">○ В процессе</option>
                <option value="not_started">Не начато</option>
              </select>
            </div>

            <div className="text-xs font-extrabold text-purple-600 dark:text-purple-400">
              Освоено тем: {masteredTotal} / {totalTopicsCount}
            </div>
          </div>

          {/* Level Accordions */}
          {Object.keys(LEVEL_CONFIG).map((level) => {
            const levelTopics = (groupedByLevel[level] || []).filter(t => {
              if (filterCategory !== 'all' && t.category !== filterCategory) return false;
              if (filterStatus === 'mastered' && !(t.is_locked || t.status === 'mastered' || t.score >= 80)) return false;
              if (filterStatus === 'in_progress' && (t.status !== 'in_progress' && t.score < 10)) return false;
              if (filterStatus === 'not_started' && (t.status === 'mastered' || t.score > 0)) return false;
              return true;
            });

            const isExpanded = expandedLevels[level];
            const cfg = LEVEL_CONFIG[level];
            const masteredInLevel = (groupedByLevel[level] || []).filter(t => t.is_locked || t.status === 'mastered' || t.score >= 80).length;
            const totalInLevel = (groupedByLevel[level] || []).length;

            return (
              <div
                key={level}
                className="glass-card rounded-3xl border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 shadow-md overflow-hidden"
              >
                {/* Level Header */}
                <div
                  onClick={() => toggleLevel(level)}
                  className="p-5 flex items-center justify-between cursor-pointer hover:bg-purple-50/50 dark:hover:bg-gray-750 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{cfg.emoji}</span>
                    <div>
                      <h3 className="font-extrabold text-lg text-gray-900 dark:text-white">
                        Уровень {level} — {cfg.label}
                      </h3>
                      <span className="text-xs text-gray-500 font-medium">
                        {masteredInLevel} из {totalInLevel} тем освоено • ({levelTopics.length} отображается)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExamLevel(level);
                      }}
                      className="px-3.5 py-1.5 bg-gradient-to-r from-amber-400 to-orange-500 text-white font-extrabold text-xs rounded-xl shadow transition-transform active:scale-95 flex items-center gap-1.5"
                    >
                      <GraduationCap className="w-4 h-4" />
                      <span>Экзамен {level}</span>
                    </button>

                    {isExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                  </div>
                </div>

                {/* Topics Grid inside Level */}
                {isExpanded && (
                  <div className="p-5 border-t border-purple-50 dark:border-gray-700 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 bg-gray-50/50 dark:bg-gray-850/50">
                    {levelTopics.map((topic) => (
                      <div
                        key={topic.id}
                        onClick={() => openTheory(topic)}
                        className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-purple-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer flex items-center justify-between group"
                      >
                        <div className="flex items-center space-x-3 pr-2 min-w-0">
                          <StatusIcon status={topic.status} score={topic.score} isLocked={topic.is_locked} />
                          <div className="min-w-0">
                            <div className="text-[10px] font-bold uppercase text-purple-600 dark:text-purple-400">
                              {topic.category}
                            </div>
                            <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
                              {topic.name}
                            </div>
                          </div>
                        </div>

                        <span className="text-xs font-bold text-purple-600 group-hover:underline flex-shrink-0 ml-2">
                          Теория ➔
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW 2: A1 ADVENTURE ROADMAP WITH MATEO */}
      {activeTab === 'a1_map' && (
        <A1AdventureMap onSelectTopicForPractice={(topic) => openTheory(topic)} />
      )}

      {/* Modals */}
      {selectedTopicId && (
        <TopicTheoryModal
          topicId={selectedTopicId}
          topicName={selectedTopicName}
          isOpen={Boolean(selectedTopicId)}
          onClose={() => {
            setSelectedTopicId(null);
            setSelectedTopicName(null);
          }}
        />
      )}

      {examLevel && (
        <ExamModal
          level={examLevel}
          isOpen={Boolean(examLevel)}
          onClose={() => setExamLevel(null)}
        />
      )}
    </div>
  );
}
