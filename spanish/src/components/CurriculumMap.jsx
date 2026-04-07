import React, { useState, useEffect } from 'react';
import { 
  ChevronDown, ChevronRight, CheckCircle2, Circle, 
  TrendingUp, TrendingDown, Filter, Map, ArrowDownUp, Sparkles, Trash2
} from 'lucide-react';
import { profileApiUrl, profileFetch } from '../utils/api';
import { useTheme } from '../contexts/ThemeContext';

const LEVEL_CONFIG = {
  'A1': { label: 'Beginner', emoji: '📗', gradient: 'from-green-400 to-green-500' },
  'A2': { label: 'Elementary', emoji: '📗', gradient: 'from-emerald-400 to-teal-500' },
  'B1': { label: 'Intermediate', emoji: '📘', gradient: 'from-blue-400 to-blue-500' },
  'B2': { label: 'Upper-Intermediate', emoji: '📘', gradient: 'from-indigo-400 to-purple-500' },
  'C1': { label: 'Advanced', emoji: '📙', gradient: 'from-orange-400 to-amber-500' },
  'C2': { label: 'Mastery', emoji: '📕', gradient: 'from-red-400 to-rose-500' },
};

const CATEGORY_ICONS = {
  'Grammar': '📝',
  'Vocabulary': '📖',
  'Speaking': '🗣️',
};

function StatusIcon({ status, score }) {
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

function CurriculumMap() {
  const { isDark } = useTheme();
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedLevels, setExpandedLevels] = useState({});
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortMode, setSortMode] = useState('default'); // default | weakest | strongest

  // Theme-aware colors
  const card = isDark ? 'bg-slate-800 text-gray-100' : 'bg-white text-gray-800';
  const cardHover = isDark ? 'hover:bg-slate-700' : 'hover:bg-gray-50';
  const subtext = isDark ? 'text-gray-400' : 'text-gray-500';
  const subtextStrong = isDark ? 'text-gray-300' : 'text-gray-600';
  const inputBg = isDark ? 'bg-slate-700 border-slate-600 text-gray-200' : 'bg-pink-50 border-pink-200';
  const progressBg = isDark ? 'bg-slate-600' : 'bg-gray-200';
  const btnActive = isDark ? 'bg-fuchsia-600 text-white' : 'bg-fuchsia-400 text-gray-900';
  const btnInactive = isDark ? 'bg-slate-700 text-gray-300 hover:bg-slate-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200';

  useEffect(() => {
    fetchCurriculum();
  }, []);

  const fetchCurriculum = async () => {
    try {
      const response = await profileFetch(profileApiUrl('/spanish/api/curriculum'));
      const data = await response.json();
      setTopics(data.topics);
      
      const levels = {};
      const grouped = groupByLevel(data.topics);
      for (const level of Object.keys(grouped)) {
        const hasProgress = grouped[level].some(t => t.status !== 'not_started');
        levels[level] = hasProgress;
      }
      if (Object.keys(grouped).length > 0) {
        levels[Object.keys(grouped)[0]] = true;
      }
      setExpandedLevels(levels);
    } catch (error) {
      console.error('Error fetching curriculum:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteTopic = async (id, source) => {
    const msg = source === 'ai_detected' ? 'Delete this AI-detected topic?' : 'Reset this topic progress?';
    if (!confirm(msg)) return;
    try {
      await profileFetch(profileApiUrl(`/spanish/api/topics/${id}`), { method: 'DELETE' });
      fetchCurriculum();
    } catch (error) {
      console.error('Error deleting topic:', error);
    }
  };

  const groupByLevel = (topics) => {
    return topics.reduce((acc, topic) => {
      if (!acc[topic.level]) acc[topic.level] = [];
      acc[topic.level].push(topic);
      return acc;
    }, {});
  };

  const toggleLevel = (level) => {
    setExpandedLevels(prev => ({ ...prev, [level]: !prev[level] }));
  };

  const getFilteredTopics = (levelTopics) => {
    let filtered = levelTopics;
    if (filterStatus !== 'all') {
      filtered = filtered.filter(t => t.status === filterStatus);
    }
    if (filterCategory !== 'all') {
      filtered = filtered.filter(t => t.category === filterCategory);
    }
    return filtered;
  };

  const getLevelStats = (levelTopics) => {
    const total = levelTopics.length;
    const mastered = levelTopics.filter(t => t.status === 'mastered').length;
    const inProgress = levelTopics.filter(t => t.status === 'in_progress').length;
    const notStarted = levelTopics.filter(t => t.status === 'not_started').length;
    const percent = total > 0 ? Math.round((mastered / total) * 100) : 0;
    return { total, mastered, inProgress, notStarted, percent };
  };

  const getOverallStats = () => {
    const total = topics.length;
    const mastered = topics.filter(t => t.status === 'mastered').length;
    const inProgress = topics.filter(t => t.status === 'in_progress').length;
    const notStarted = topics.filter(t => t.status === 'not_started').length;
    const aiDetected = topics.filter(t => t.source === 'ai_detected').length;
    const percent = total > 0 ? Math.round((mastered / total) * 100) : 0;
    return { total, mastered, inProgress, notStarted, aiDetected, percent };
  };

  const groupByCategory = (levelTopics) => {
    return levelTopics.reduce((acc, topic) => {
      if (!acc[topic.category]) acc[topic.category] = [];
      acc[topic.category].push(topic);
      return acc;
    }, {});
  };

  // Sort topics within each category
  const sortTopics = (topicsList) => {
    if (sortMode === 'default') return topicsList;
    return [...topicsList].sort((a, b) => {
      // Active topics (in_progress/mastered) first, then not_started
      const aActive = a.status !== 'not_started' ? 1 : 0;
      const bActive = b.status !== 'not_started' ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      
      if (sortMode === 'weakest') return a.score - b.score;
      if (sortMode === 'strongest') return b.score - a.score;
      return 0;
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className={`${card} rounded-2xl shadow-xl p-6 skeleton h-24`} />
        ))}
      </div>
    );
  }

  const grouped = groupByLevel(topics);
  const overall = getOverallStats();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className={`${card} rounded-2xl shadow-2xl p-6`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Map className="h-8 w-8 text-fuchsia-500" />
            <div>
              <h2 className="text-3xl font-bold">Curriculum Map</h2>
              <p className={`${subtext} text-sm mt-1`}>
                Your complete CEFR learning path — {topics.length} topics from A1 to C2
                {overall.aiDetected > 0 && (
                  <span className="ml-2">
                    (including {overall.aiDetected} AI-detected)
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Overall stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className={`${isDark ? 'bg-fuchsia-900/30' : 'bg-gradient-to-r from-pink-100 to-violet-100'} rounded-xl p-3 text-center`}>
            <p className={`text-2xl font-bold ${isDark ? 'text-pink-300' : 'text-fuchsia-800'}`}>{overall.total}</p>
            <p className={`text-xs ${isDark ? 'text-fuchsia-400' : 'text-fuchsia-700'}`}>Total topics</p>
          </div>
          <div className={`${isDark ? 'bg-green-900/30' : 'bg-gradient-to-r from-green-100 to-emerald-100'} rounded-xl p-3 text-center`}>
            <p className={`text-2xl font-bold ${isDark ? 'text-green-300' : 'text-green-700'}`}>{overall.mastered}</p>
            <p className={`text-xs ${isDark ? 'text-green-400' : 'text-green-600'}`}>✅ Mastered</p>
          </div>
          <div className={`${isDark ? 'bg-amber-900/30' : 'bg-gradient-to-r from-amber-100 to-orange-100'} rounded-xl p-3 text-center`}>
            <p className={`text-2xl font-bold ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>{overall.inProgress}</p>
            <p className={`text-xs ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>🟡 In progress</p>
          </div>
          <div className={`${isDark ? 'bg-slate-700/50' : 'bg-gradient-to-r from-gray-100 to-slate-100'} rounded-xl p-3 text-center`}>
            <p className={`text-2xl font-bold ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{overall.notStarted}</p>
            <p className={`text-xs ${subtext}`}>⬜ Not started</p>
          </div>
        </div>

        {/* Overall progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className={subtextStrong}>Overall mastery</span>
            <span className={`font-bold ${isDark ? 'text-fuchsia-400' : 'text-fuchsia-700'}`}>{overall.percent}%</span>
          </div>
          <div className={`w-full ${progressBg} rounded-full h-3 overflow-hidden`}>
            <div
              className="h-full bg-gradient-to-r from-fuchsia-400 to-purple-400 transition-all duration-700 rounded-full"
              style={{ width: `${overall.percent}%` }}
            />
          </div>
        </div>

        {/* Filters + Sort */}
        <div className="flex flex-wrap gap-3 mt-4 items-center">
          <div className="flex items-center space-x-2">
            <Filter className={`h-4 w-4 ${subtext}`} />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className={`px-3 py-1.5 border-2 rounded-lg text-sm focus:outline-none focus:border-fuchsia-400 ${inputBg}`}
            >
              <option value="all">All statuses</option>
              <option value="mastered">✅ Mastered</option>
              <option value="in_progress">🟡 In progress</option>
              <option value="not_started">⬜ Not started</option>
            </select>
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className={`px-3 py-1.5 border-2 rounded-lg text-sm focus:outline-none focus:border-fuchsia-400 ${inputBg}`}
          >
            <option value="all">All categories</option>
            <option value="Grammar">📝 Grammar</option>
            <option value="Vocabulary">📖 Vocabulary</option>
            <option value="Speaking">🗣️ Speaking</option>
          </select>

          {/* Sort buttons */}
          <div className="flex items-center space-x-1 ml-auto">
            <ArrowDownUp className={`h-4 w-4 ${subtext} mr-1`} />
            {[
              { key: 'default', label: 'Default' },
              { key: 'weakest', label: '🔴 Weakest' },
              { key: 'strongest', label: '🟢 Strongest' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSortMode(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  sortMode === key ? btnActive : btnInactive
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Level sections */}
      {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((level) => {
        const levelTopics = grouped[level] || [];
        if (levelTopics.length === 0) return null;
        
        const filtered = sortTopics(getFilteredTopics(levelTopics));
        const stats = getLevelStats(levelTopics);
        const config = LEVEL_CONFIG[level];
        const isExpanded = expandedLevels[level];
        const categorized = sortMode === 'default' 
          ? groupByCategory(filtered)
          : { 'All': filtered }; // flat list when sorting

        return (
          <div key={level} className={`${card} rounded-2xl shadow-2xl overflow-hidden`}>
            {/* Level header */}
            <button
              onClick={() => toggleLevel(level)}
              className={`w-full p-5 flex items-center justify-between ${cardHover} transition-colors`}
            >
              <div className="flex items-center space-x-4">
                <span className="text-3xl">{config.emoji}</span>
                <div className="text-left">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-xl font-bold">{level}</h3>
                    <span className={`${subtext} font-medium`}>— {config.label}</span>
                  </div>
                  <div className="flex items-center space-x-3 mt-1 text-sm">
                    <span className="text-green-600">✅ {stats.mastered}</span>
                    <span className="text-amber-600">🟡 {stats.inProgress}</span>
                    <span className={subtext}>⬜ {stats.notStarted}</span>
                    <span className={subtext}>• {stats.total} topics</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="hidden sm:flex items-center space-x-3">
                  <div className={`w-32 ${progressBg} rounded-full h-2.5 overflow-hidden`}>
                    <div
                      className={`h-full bg-gradient-to-r ${config.gradient} transition-all duration-700 rounded-full`}
                      style={{ width: `${stats.percent}%` }}
                    />
                  </div>
                  <span className={`text-sm font-bold ${subtextStrong} w-10 text-right`}>
                    {stats.percent}%
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronDown className={`h-5 w-5 ${subtext}`} />
                ) : (
                  <ChevronRight className={`h-5 w-5 ${subtext}`} />
                )}
              </div>
            </button>

            {/* Mobile progress bar */}
            <div className="sm:hidden px-5 pb-2">
              <div className="flex items-center space-x-2">
                <div className={`flex-1 ${progressBg} rounded-full h-2 overflow-hidden`}>
                  <div
                    className={`h-full bg-gradient-to-r ${config.gradient} transition-all duration-700 rounded-full`}
                    style={{ width: `${stats.percent}%` }}
                  />
                </div>
                <span className={`text-xs font-bold ${subtext}`}>{stats.percent}%</span>
              </div>
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div className="px-5 pb-5 space-y-4 animate-fade-in">
                {filtered.length === 0 ? (
                  <p className={`text-center ${subtext} py-4 text-sm`}>
                    No topics match your filter
                  </p>
                ) : (
                  Object.entries(categorized).map(([category, catTopics]) => (
                    <div key={category}>
                      {category !== 'All' && (
                        <h4 className={`text-sm font-bold ${subtext} uppercase tracking-wider mb-2 flex items-center space-x-2`}>
                          <span>{CATEGORY_ICONS[category] || '📋'}</span>
                          <span>{category}</span>
                          <span className="text-xs font-normal">({catTopics.length})</span>
                        </h4>
                      )}
                      <div className="space-y-1">
                        {catTopics.map((topic) => {
                          let rowBg, rowBorder, nameColor;
                          if (topic.status === 'mastered') {
                            rowBg = isDark ? 'bg-green-900/20' : 'bg-green-50';
                            rowBorder = isDark ? 'border-green-800' : 'border-green-200';
                            nameColor = isDark ? 'text-green-300' : 'text-green-800';
                          } else if (topic.status === 'in_progress') {
                            rowBg = isDark ? 'bg-amber-900/20' : 'bg-amber-50';
                            rowBorder = isDark ? 'border-amber-800' : 'border-amber-200';
                            nameColor = isDark ? 'text-amber-300' : 'text-amber-800';
                          } else {
                            rowBg = isDark ? 'bg-slate-700/50' : 'bg-gray-50';
                            rowBorder = isDark ? 'border-slate-600' : 'border-gray-200';
                            nameColor = isDark ? 'text-gray-400' : 'text-gray-600';
                          }

                          return (
                            <div
                              key={topic.id}
                              className={`flex items-center justify-between px-4 py-2.5 rounded-xl transition-all ${rowBg} border ${rowBorder}`}
                            >
                              <div className="flex items-center space-x-3 min-w-0">
                                <StatusIcon status={topic.status} score={topic.score} />
                                <span className={`font-medium truncate ${nameColor}`}>
                                  {topic.name}
                                </span>
                                {topic.source === 'ai_detected' && (
                                  <span className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                    isDark ? 'bg-purple-900/40 text-purple-300' : 'bg-purple-100 text-purple-700'
                                  }`}>
                                    <Sparkles className="h-3 w-3" />
                                    <span>AI</span>
                                  </span>
                                )}
                                {sortMode !== 'default' && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                                    isDark ? 'bg-slate-600 text-gray-300' : 'bg-gray-200 text-gray-500'
                                  }`}>
                                    {topic.level} · {topic.category}
                                  </span>
                                )}
                              </div>
                              
                              <div className="flex items-center space-x-3 flex-shrink-0 ml-2">
                                {topic.status !== 'not_started' && (
                                  <>
                                    <div className="flex items-center space-x-1 text-xs">
                                      <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                                      <span className="text-green-600">{topic.success_count}</span>
                                    </div>
                                    <div className="flex items-center space-x-1 text-xs">
                                      <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                                      <span className="text-red-600">{topic.failure_count}</span>
                                    </div>
                                    <div className={`w-16 ${progressBg} rounded-full h-1.5 overflow-hidden`}>
                                      <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                          topic.score >= 80 
                                            ? 'bg-green-400' 
                                            : topic.score >= 40 
                                            ? 'bg-amber-400' 
                                            : 'bg-red-400'
                                        }`}
                                        style={{ width: `${Math.max(3, topic.score)}%` }}
                                      />
                                    </div>
                                    <span className={`text-xs font-bold w-8 text-right ${
                                      topic.score >= 80 
                                        ? 'text-green-600' 
                                        : topic.score >= 40 
                                        ? 'text-amber-600' 
                                        : 'text-red-600'
                                    }`}>
                                      {Math.round(topic.score)}
                                    </span>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); deleteTopic(topic.id, topic.source); }}
                                      className={`p-1 rounded transition-colors ${
                                        isDark ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-100 text-red-500'
                                      }`}
                                      title={topic.source === 'ai_detected' ? 'Delete topic' : 'Reset progress'}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default CurriculumMap;
