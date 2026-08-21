import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronDown, ChevronRight, CheckCircle2, Circle,
  TrendingUp, Filter, Map, Sparkles, Trophy, Award, GraduationCap, Compass,
  BookOpen, Layers, ShieldCheck, Headphones, BookMarked, HelpCircle
} from 'lucide-react';
import { profileApiUrl, profileFetch } from '../utils/api';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import TopicTheoryModal from './TopicTheoryModal';
import ExamModal from './ExamModal';
import A1UnitsView from './A1UnitsView';
import A1AdventureMap from './A1AdventureMap';
import A1CheckpointsView from './A1CheckpointsView';
import A1SkillsView from './A1SkillsView';
import A1VocabularyDomainsView from './A1VocabularyDomainsView';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const topicParam = searchParams.get('topic');

  const VALID_TABS = ['a1_units', 'a1_map', 'checkpoints', 'skills', 'vocab_domains', 'all_topics'];
  const [activeTab, setActiveTab] = useState(
    tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'a1_units'
  );

  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedLevels, setExpandedLevels] = useState({ 'A1': true, 'A2': false, 'B1': false, 'B2': false, 'C1': false, 'C2': false });
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

  useEffect(() => {
    if (tabParam && VALID_TABS.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  useEffect(() => {
    if (topicParam && topics.length > 0) {
      const target = topics.find(t => String(t.id) === String(topicParam));
      if (target) {
        setSelectedTopicId(target.id);
        setSelectedTopicName(target.name);
      }
    }
  }, [topicParam, topics]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', tabId);
      return next;
    });
  };

  const toggleLevel = (level) => {
    setExpandedLevels(prev => ({ ...prev, [level]: !prev[level] }));
  };

  const openTheory = (topic) => {
    setSelectedTopicId(topic.id);
    setSelectedTopicName(topic.name);
  };

  const groupedByLevel = topics.reduce((acc, topic) => {
    if (!acc[topic.level]) acc[topic.level] = [];
    acc[topic.level].push(topic);
    return acc;
  }, {});

  const isTopicMastered = (topic) => topic.level === 'A1'
    ? topic.status === 'mastered'
    : Boolean(topic.is_locked || topic.status === 'mastered' || topic.score >= 80);
  const totalTopicsCount = topics.length || 158;
  const masteredTotal = topics.filter(isTopicMastered).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn space-y-6">
      {/* Title banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gradient flex items-center gap-3">
            <Map className="h-9 w-9 text-fuchsia-500" />
            {t('nav_curriculum', 'Учебный план курса')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1 text-xs sm:text-sm">
            Академическая программа CEFR: 9 модулей A1 с интерактивной практикой, аудио, контрольными точками и 650 леммами.
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex flex-wrap items-center gap-1.5 bg-white/90 dark:bg-gray-800/90 p-1.5 rounded-2xl border border-purple-200 dark:border-gray-700 shadow-md">
          <button
            onClick={() => handleTabChange('a1_units')}
            className={`px-3.5 py-2 rounded-xl font-black text-xs sm:text-sm transition-all flex items-center gap-1.5 ${
              activeTab === 'a1_units'
                ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-md'
                : 'text-gray-600 dark:text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-gray-700'
            }`}
          >
            <Layers className="w-4 h-4 text-amber-300" />
            <span>🎓 9 Модулей A1</span>
          </button>

          <button
            onClick={() => handleTabChange('a1_map')}
            className={`px-3.5 py-2 rounded-xl font-black text-xs sm:text-sm transition-all flex items-center gap-1.5 ${
              activeTab === 'a1_map'
                ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-md'
                : 'text-gray-600 dark:text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-gray-700'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>🗺️ Карта (9 глав)</span>
          </button>

          <button
            onClick={() => handleTabChange('checkpoints')}
            className={`px-3.5 py-2 rounded-xl font-black text-xs sm:text-sm transition-all flex items-center gap-1.5 ${
              activeTab === 'checkpoints'
                ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-md'
                : 'text-gray-600 dark:text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-gray-700'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>🎯 10 Срезов</span>
          </button>

          <button
            onClick={() => handleTabChange('skills')}
            className={`px-3.5 py-2 rounded-xl font-black text-xs sm:text-sm transition-all flex items-center gap-1.5 ${
              activeTab === 'skills'
                ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-md'
                : 'text-gray-600 dark:text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-gray-700'
            }`}
          >
            <Headphones className="w-4 h-4" />
            <span>🎧 4 Навыка</span>
          </button>

          <button
            onClick={() => handleTabChange('vocab_domains')}
            className={`px-3.5 py-2 rounded-xl font-black text-xs sm:text-sm transition-all flex items-center gap-1.5 ${
              activeTab === 'vocab_domains'
                ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-md'
                : 'text-gray-600 dark:text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-gray-700'
            }`}
          >
            <BookMarked className="w-4 h-4" />
            <span>📚 650 Слов</span>
          </button>

          <button
            onClick={() => handleTabChange('all_topics')}
            className={`px-3 py-2 rounded-xl font-black text-xs sm:text-sm transition-all flex items-center gap-1.5 ${
              activeTab === 'all_topics'
                ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-md'
                : 'text-gray-600 dark:text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-gray-700'
            }`}
          >
            <span>🌐 Все уровни (A1–C2)</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: 9 THEMATIC A1 UNITS (DEFAULT & PRIMARY) */}
      {activeTab === 'a1_units' && (
        <A1UnitsView
          onOpenTheory={(topic) => openTheory(topic)}
          onOpenExercises={(topic) => openTheory(topic)}
          onOpenCheckpoint={(unitOrder) => handleTabChange('checkpoints')}
          onOpenSkills={() => handleTabChange('skills')}
          onOpenVocab={() => handleTabChange('vocab_domains')}
        />
      )}

      {/* VIEW 2: A1 ADVENTURE ROADMAP WITH MATEO (9 CHAPTERS) */}
      {activeTab === 'a1_map' && (
        <A1AdventureMap onSelectTopicForPractice={(topic) => openTheory(topic)} />
      )}

      {/* VIEW 3: A1 CHECKPOINTS (UNITS 1-9 & FINAL) */}
      {activeTab === 'checkpoints' && (
        <A1CheckpointsView />
      )}

      {/* VIEW 4: A1 SKILL EVIDENCE ASSESSMENTS */}
      {activeTab === 'skills' && (
        <A1SkillsView />
      )}

      {/* VIEW 5: 650 CORE VOCABULARY LEMMAS ACROSS 12 DOMAINS */}
      {activeTab === 'vocab_domains' && (
        <A1VocabularyDomainsView />
      )}

      {/* VIEW 6: FULL 158-TOPIC CATALOG (A1 to C2) */}
      {activeTab === 'all_topics' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Filters & Overall Summary */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white/80 dark:bg-gray-800/80 p-4 rounded-3xl border border-purple-100 dark:border-gray-700 shadow-sm">
            <div className="flex items-center space-x-2 text-xs font-bold text-gray-500">
              <Filter className="w-4 h-4 text-purple-600" />
              <span>Фильтр каталога тем:</span>
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
              if (filterStatus === 'mastered' && !isTopicMastered(t)) return false;
              if (filterStatus === 'in_progress' && (t.status !== 'in_progress' && t.score < 10)) return false;
              if (filterStatus === 'not_started' && (t.status === 'mastered' || t.score > 0)) return false;
              return true;
            });

            const isExpanded = expandedLevels[level];
            const cfg = LEVEL_CONFIG[level];
            const masteredInLevel = (groupedByLevel[level] || []).filter(isTopicMastered).length;
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
                      className="px-3.5 py-1.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white rounded-xl text-xs font-bold shadow transition-transform active:scale-95 flex items-center space-x-1.5"
                    >
                      <GraduationCap className="h-4 w-4" />
                      <span className="hidden sm:inline">Экзамен {level}</span>
                    </button>

                    <div className="p-1 rounded-full text-gray-400 hover:text-gray-600">
                      {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    </div>
                  </div>
                </div>

                {/* Topics Grid */}
                {isExpanded && (
                  <div className="p-5 pt-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 border-t border-purple-50 dark:border-gray-700/50">
                    {levelTopics.map((topic) => (
                      <div
                        key={topic.id}
                        onClick={() => openTheory(topic)}
                        className="p-3.5 rounded-2xl border border-purple-100 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/70 hover:bg-white dark:hover:bg-gray-750 hover:border-purple-300 dark:hover:border-purple-600 transition-all cursor-pointer shadow-sm hover:shadow-md flex items-center justify-between group"
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <StatusIcon
                            status={topic.status}
                            score={topic.score || 0}
                            isLocked={topic.is_locked}
                          />
                          <div className="min-w-0">
                            <div className="text-[10px] uppercase font-bold text-gray-400">
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
