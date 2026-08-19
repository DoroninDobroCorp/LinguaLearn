import React, { useState, useEffect } from 'react';
import { 
  ChevronDown, ChevronRight, CheckCircle2, Circle, 
  TrendingUp, TrendingDown, Filter, Map, ArrowDownUp, Sparkles, Trash2,
  Lock, Unlock, ShieldCheck
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

function StatusIcon({ status, score, isLocked }) {
  if (isLocked) {
    return <ShieldCheck className="h-5 w-5 text-amber-500 flex-shrink-0" title="Выучено навсегда (Заморожено)" />;
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
  const progressBg = isDark ? 'bg-slate-700' : 'bg-gray-200';
  const inputBg = isDark ? 'bg-slate-700 text-gray-100 border-slate-600' : 'bg-white text-gray-800 border-gray-200';
  const btnActive = isDark ? 'bg-fuchsia-600 text-white' : 'bg-fuchsia-600 text-white';
  const btnInactive = isDark ? 'bg-slate-700 text-gray-300 hover:bg-slate-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200';

  useEffect(() => {
    fetchCurriculum();
  }, []);

  const fetchCurriculum = async () => {
    try {
      const response = await profileFetch(profileApiUrl('/spanish/api/curriculum'));
      const data = await response.json();
      setTopics(data.topics || []);

      // Expand levels with active progress
      const grouped = groupByLevel(data.topics || []);
      const levels = {};
      for (const [level, levelTopics] of Object.entries(grouped)) {
        const hasProgress = levelTopics.some(t => t.status !== 'not_started');
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

  const setTopicManualScore = async (topicId, score, isLocked) => {
    // Optimistic update
    setTopics(prev => prev.map(t => {
      if (t.id === topicId) {
        const newScore = typeof score === 'number' ? score : (isLocked ? 100 : t.score);
        const newStatus = newScore >= 80 ? 'mastered' : (newScore > 0 ? 'in_progress' : 'not_started');
        const newLocked = isLocked !== undefined ? (isLocked ? 1 : 0) : t.is_locked;
        return {
          ...t,
          score: newScore,
          status: newStatus,
          is_locked: newLocked
        };
      }
      return t;
    }));

    try {
      await profileFetch(profileApiUrl(`/spanish/api/topics/${topicId}/set-score`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, isLocked })
      });
    } catch (error) {
      console.error('Error setting topic score:', error);
      fetchCurriculum();
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
    const lockedCount = topics.filter(t => t.is_locked).length;
    const percent = total > 0 ? Math.round((mastered / total) * 100) : 0;
    return { total, mastered, inProgress, notStarted, aiDetected, lockedCount, percent };
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
    <div className="space-y-6">
      {/* Header card with overall stats */}
      <div className={`${card} rounded-2xl shadow-xl p-6`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center space-x-3">
            <Map className="h-8 w-8 text-fuchsia-400" />
            <div>
              <h2 className="text-2xl font-bold">Curriculum Map</h2>
              <p className={`text-sm ${subtext}`}>Track and manage your progress across CEFR levels (A1–C2)</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full font-medium">
              ✅ {overall.mastered} mastered
            </span>
            {overall.lockedCount > 0 && (
              <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full font-medium flex items-center gap-1">
                🔒 {overall.lockedCount} frozen at 100%
              </span>
            )}
            <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full font-medium">
              🟡 {overall.inProgress} in progress
            </span>
            <span className={`px-3 py-1 ${isDark ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-600'} rounded-full font-medium`}>
              ⬜ {overall.notStarted} not started
            </span>
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
          : { 'All': filtered };

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
                          if (topic.is_locked) {
                            rowBg = isDark ? 'bg-amber-950/30' : 'bg-amber-50/80';
                            rowBorder = isDark ? 'border-amber-700/60' : 'border-amber-300';
                            nameColor = isDark ? 'text-amber-200' : 'text-amber-900';
                          } else if (topic.status === 'mastered') {
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
                              <div className="flex items-center space-x-3 min-w-0 flex-1">
                                <StatusIcon status={topic.status} score={topic.score} isLocked={topic.is_locked} />
                                <span className={`font-medium truncate ${nameColor}`}>
                                  {topic.name}
                                </span>
                                {topic.is_locked === 1 && (
                                  <span className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                                    isDark ? 'bg-amber-900/60 text-amber-300 border border-amber-600' : 'bg-amber-100 text-amber-800 border border-amber-300'
                                  }`}>
                                    <Lock className="h-3 w-3" />
                                    <span>Выучено навсегда (100%)</span>
                                  </span>
                                )}
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
                              
                              <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
                                {topic.status !== 'not_started' && (
                                  <div className="hidden sm:flex items-center space-x-2">
                                    <div className="flex items-center space-x-1 text-xs">
                                      <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                                      <span className="text-green-600">{topic.success_count}</span>
                                    </div>
                                    <div className="flex items-center space-x-1 text-xs">
                                      <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                                      <span className="text-red-600">{topic.failure_count}</span>
                                    </div>
                                    <div className={`w-14 ${progressBg} rounded-full h-1.5 overflow-hidden`}>
                                      <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                          topic.is_locked
                                            ? 'bg-amber-400'
                                            : topic.score >= 80 
                                            ? 'bg-green-400' 
                                            : topic.score >= 40 
                                            ? 'bg-amber-400' 
                                            : 'bg-red-400'
                                        }`}
                                        style={{ width: `${Math.max(3, topic.score)}%` }}
                                      />
                                    </div>
                                    <span className={`text-xs font-bold w-7 text-right ${
                                      topic.is_locked
                                        ? 'text-amber-500'
                                        : topic.score >= 80 
                                        ? 'text-green-600' 
                                        : topic.score >= 40 
                                        ? 'text-amber-600' 
                                        : 'text-red-600'
                                    }`}>
                                      {Math.round(topic.score)}%
                                    </span>
                                  </div>
                                )}

                                {/* Manual Action Buttons: 0%, 100%, and Lock toggle */}
                                <div className="flex items-center space-x-1 border-l pl-2 border-gray-300/40">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setTopicManualScore(topic.id, 0, false); }}
                                    className={`px-1.5 py-0.5 rounded text-xs font-medium transition-all ${
                                      topic.score === 0 && topic.status === 'not_started'
                                        ? (isDark ? 'bg-slate-600 text-gray-300' : 'bg-gray-300 text-gray-800')
                                        : (isDark ? 'hover:bg-slate-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500')
                                    }`}
                                    title="Сбросить на 0%"
                                  >
                                    0%
                                  </button>

                                  <button
                                    onClick={(e) => { e.stopPropagation(); setTopicManualScore(topic.id, 100, false); }}
                                    className={`px-1.5 py-0.5 rounded text-xs font-medium transition-all ${
                                      topic.score === 100 && !topic.is_locked
                                        ? 'bg-green-500 text-white'
                                        : (isDark ? 'hover:bg-green-900/40 text-green-400' : 'hover:bg-green-100 text-green-600')
                                    }`}
                                    title="Установить 100%"
                                  >
                                    100%
                                  </button>

                                  <button
                                    onClick={(e) => { e.stopPropagation(); setTopicManualScore(topic.id, 100, !topic.is_locked); }}
                                    className={`px-2 py-0.5 rounded text-xs font-semibold flex items-center gap-1 transition-all ${
                                      topic.is_locked
                                        ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm'
                                        : (isDark ? 'hover:bg-amber-900/30 text-amber-400 border border-amber-700/50' : 'hover:bg-amber-100 text-amber-700 border border-amber-300')
                                    }`}
                                    title={topic.is_locked ? "Разблокировать тему" : "Зафиксировать на 100% (Выучено навсегда)"}
                                  >
                                    {topic.is_locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3 opacity-60" />}
                                    <span className="hidden md:inline">{topic.is_locked ? 'Заморожено' : 'Заморозить'}</span>
                                  </button>

                                  <button
                                    onClick={(e) => { e.stopPropagation(); deleteTopic(topic.id, topic.source); }}
                                    className={`p-1 rounded transition-colors ${
                                      isDark ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-100 text-red-500'
                                    }`}
                                    title={topic.source === 'ai_detected' ? 'Delete topic' : 'Reset progress'}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
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
