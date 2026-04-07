import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Trash2, AlertCircle, Award } from 'lucide-react';
import { profileApiUrl } from '../utils/api';

const LEVEL_COLORS = {
  'A1': 'bg-green-200 text-green-800',
  'A2': 'bg-green-300 text-green-900',
  'B1': 'bg-pink-200 text-fuchsia-800',
  'B2': 'bg-pink-300 text-fuchsia-900',
  'C1': 'bg-orange-200 text-orange-800',
  'C2': 'bg-red-200 text-red-800',
};

function Topics() {
  const [topics, setTopics] = useState([]);
  const [maxLevel, setMaxLevel] = useState('B2');
  const [sortBy, setSortBy] = useState('score');
  
  useEffect(() => {
    fetchTopics();
  }, []);
  
  const fetchTopics = async () => {
    try {
      const response = await fetch(profileApiUrl('/spanish/api/topics'));
      const data = await response.json();
      setTopics(data.topics);
      setMaxLevel(data.maxLevel);
    } catch (error) {
      console.error('Error fetching topics:', error);
    }
  };
  
  const deleteTopic = async (id) => {
    if (!confirm('Удалить эту тему?')) return;
    
    try {
      await fetch(profileApiUrl(`/spanish/api/topics/${id}`), { method: 'DELETE' });
      fetchTopics();
    } catch (error) {
      console.error('Error deleting topic:', error);
    }
  };
  
  const sortedTopics = [...topics].sort((a, b) => {
    if (sortBy === 'score') return a.score - b.score;
    if (sortBy === 'level') {
      const levelOrder = { 'A1': 0, 'A2': 1, 'B1': 2, 'B2': 3, 'C1': 4, 'C2': 5 };
      return levelOrder[a.level] - levelOrder[b.level];
    }
    if (sortBy === 'category') return a.category.localeCompare(b.category);
    return 0;
  });
  
  const groupedByCategory = sortedTopics.reduce((acc, topic) => {
    if (!acc[topic.category]) acc[topic.category] = [];
    acc[topic.category].push(topic);
    return acc;
  }, {});
  
  const getScoreColor = (score) => {
    if (score < 30) return 'text-red-600';
    if (score < 60) return 'text-fuchsia-600';
    return 'text-green-600';
  };
  
  const getProgressWidth = (score) => `${Math.min(100, Math.max(0, score))}%`;
  
  if (topics.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-2xl p-12 text-center">
        <AlertCircle className="h-16 w-16 mx-auto text-fuchsia-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-800 mb-2">No topics yet</h2>
        <p className="text-gray-600">
          Start chatting with the assistant, and topics you need to work on will appear here!
        </p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Заголовок и фильтры */}
      <div className="bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-3xl font-bold text-gray-800">Topics to Work On</h2>
            <p className="text-gray-600 mt-1">
              Max level: <span className="font-semibold text-fuchsia-700">{maxLevel}</span>
            </p>
          </div>
          
          <div className="flex items-center space-x-3">
            <label className="text-sm font-medium text-gray-700">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 bg-pink-100 border-2 border-pink-300 rounded-lg focus:outline-none focus:border-fuchsia-400"
            >
              <option value="score">By progress</option>
              <option value="level">By level</option>
              <option value="category">By category</option>
            </select>
          </div>
        </div>
        
        {/* Статистика */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-r from-pink-100 to-pink-200 rounded-xl p-4">
            <div className="flex items-center space-x-3">
              <Award className="h-8 w-8 text-fuchsia-700" />
              <div>
                <p className="text-sm text-fuchsia-700">Total topics</p>
                <p className="text-2xl font-bold text-fuchsia-900">{topics.length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-green-100 to-green-200 rounded-xl p-4">
            <div className="flex items-center space-x-3">
              <TrendingUp className="h-8 w-8 text-green-700" />
              <div>
                <p className="text-sm text-green-700">Successes</p>
                <p className="text-2xl font-bold text-green-900">
                  {topics.reduce((sum, t) => sum + t.success_count, 0)}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-red-100 to-red-200 rounded-xl p-4">
            <div className="flex items-center space-x-3">
              <TrendingDown className="h-8 w-8 text-red-700" />
              <div>
                <p className="text-sm text-red-700">Mistakes</p>
                <p className="text-2xl font-bold text-red-900">
                  {topics.reduce((sum, t) => sum + t.failure_count, 0)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Темы по категориям */}
      {Object.entries(groupedByCategory).map(([category, categoryTopics]) => (
        <div key={category} className="bg-white rounded-2xl shadow-2xl p-6">
          <h3 className="text-2xl font-bold text-gray-800 mb-4">{category}</h3>
          
          <div className="space-y-3">
            {categoryTopics.map((topic) => (
              <div
                key={topic.id}
                className="bg-gradient-to-r from-pink-50 to-violet-50 rounded-xl p-5 hover:shadow-md transition-shadow border-2 border-pink-200"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="text-lg font-bold text-gray-800">{topic.name}</h4>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${LEVEL_COLORS[topic.level]}`}>
                        {topic.level}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <div className="flex items-center space-x-1">
                        <TrendingUp className="h-4 w-4 text-green-600" />
                        <span>{topic.success_count}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <TrendingDown className="h-4 w-4 text-red-600" />
                        <span>{topic.failure_count}</span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {topic.last_practiced ? `Last practiced: ${new Date(topic.last_practiced).toLocaleDateString('en-US')}` : 'Not practiced yet'}
                      </span>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => deleteTopic(topic.id)}
                    className="ml-4 p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
                
                {/* Прогресс-бар */}
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Progress</span>
                    <span className={`font-bold ${getScoreColor(topic.score)}`}>
                      {topic.score.toFixed(0)}/100
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-fuchsia-400 to-purple-400 transition-all duration-500 rounded-full"
                      style={{ width: getProgressWidth(topic.score) }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default Topics;
