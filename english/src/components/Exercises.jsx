import React, { useState, useEffect } from 'react';
import { Brain, Globe, Layers, Zap, Search, Target } from 'lucide-react';
import ClassicQuizSection from './exercises/ClassicQuizSection';
import SentenceTranslationSection from './exercises/SentenceTranslationSection';
import WordTilesSection from './exercises/WordTilesSection';
import SpeedMatchSection from './exercises/SpeedMatchSection';
import ErrorDetectiveSection from './exercises/ErrorDetectiveSection';
import VerbDrillsSection from './exercises/VerbDrillsSection';

export default function Exercises() {
  const [activeTab, setActiveTab] = useState('grammar');
  const [topics, setTopics] = useState([]);

  useEffect(() => {
    loadTopics();
  }, []);

  const loadTopics = async () => {
    try {
      const response = await fetch('/english/api/curriculum');
      const data = await response.json();
      setTopics(data.topics || []);
    } catch (error) {
      console.error('Error loading topics:', error);
    }
  };

  const tabs = [
    { id: 'grammar', label: 'Грамматика', icon: Brain, gradient: 'from-purple-600 to-pink-600' },
    { id: 'translation', label: 'Перевод', icon: Globe, gradient: 'from-indigo-600 to-purple-600' },
    { id: 'word-tiles', label: 'Конструктор', icon: Layers, gradient: 'from-fuchsia-600 to-pink-600' },
    { id: 'speed-match', label: 'Спринт', icon: Zap, gradient: 'from-amber-500 to-orange-500' },
    { id: 'detective', label: 'Детектив', icon: Search, gradient: 'from-rose-500 to-pink-600' },
    { id: 'verbs', label: 'Глаголы', icon: Target, gradient: 'from-purple-600 to-indigo-600' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 6 Gamified Mode Selector Tabs */}
      <div className="bg-white p-2 rounded-2xl shadow-md grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 border-2 border-gray-100 text-xs sm:text-sm">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all ${
                isActive
                  ? `bg-gradient-to-r ${tab.gradient} text-white shadow-md scale-102`
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'grammar' && (
        <ClassicQuizSection allTopics={topics} onTopicUpdated={loadTopics} />
      )}

      {activeTab === 'translation' && (
        <SentenceTranslationSection topics={topics} onTopicUpdated={loadTopics} />
      )}

      {activeTab === 'word-tiles' && (
        <WordTilesSection />
      )}

      {activeTab === 'speed-match' && (
        <SpeedMatchSection />
      )}

      {activeTab === 'detective' && (
        <ErrorDetectiveSection />
      )}

      {activeTab === 'verbs' && (
        <VerbDrillsSection />
      )}
    </div>
  );
}
