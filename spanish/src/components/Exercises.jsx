import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Brain } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { soundEngine } from '../utils/soundEffects';

import SentenceTranslationSection from './exercises/SentenceTranslationSection';
import ClassicQuizSection from './exercises/ClassicQuizSection';
import VerbDrillsSection from './exercises/VerbDrillsSection';
import WordTilesSection from './exercises/WordTilesSection';
import SpeedMatchSection from './exercises/SpeedMatchSection';
import ErrorDetectiveSection from './exercises/ErrorDetectiveSection';

const VALID_EXERCISE_TABS = ['translation', 'classic_quiz', 'verb_drills', 'word_tiles', 'speed_match', 'error_detective'];

export default function Exercises() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(() => {
    if (VALID_EXERCISE_TABS.includes(tabParam)) return tabParam;
    try {
      const saved = localStorage.getItem('lingua_spanish_exercise_tab');
      if (VALID_EXERCISE_TABS.includes(saved)) return saved;
    } catch {}
    return 'translation';
  });
  const recommendedMode = searchParams.get('mode') === 'recommended';
  const topicIds = (searchParams.get('topicIds') || '')
    .split(',')
    .map(Number)
    .filter((topicId) => Number.isInteger(topicId) && topicId > 0)
    .slice(0, 5);

  useEffect(() => {
    if (VALID_EXERCISE_TABS.includes(tabParam)) setActiveTab(tabParam);
  }, [tabParam]);

  useEffect(() => {
    try {
      if (VALID_EXERCISE_TABS.includes(activeTab)) {
        localStorage.setItem('lingua_spanish_exercise_tab', activeTab);
      }
    } catch {}
  }, [activeTab]);

  const tabs = [
    { id: 'translation', label: 'Перевод предложений', emoji: '🌐' },
    { id: 'classic_quiz', label: 'Тесты & Экзамены (ИИ)', emoji: '🧠' },
    { id: 'verb_drills', label: 'Спряжения глаголов', emoji: '🎯' },
    { id: 'word_tiles', label: 'Конструктор фраз', emoji: '🧩' },
    { id: 'speed_match', label: 'Speed Match Blitz', emoji: '⚡' },
    { id: 'error_detective', label: 'Детектив ошибок', emoji: '🔍' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gradient flex items-center gap-3">
          <Brain className="h-9 w-9 text-fuchsia-500" />
          {t('gym_title', 'Интерактивный тренажер испанского')}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm sm:text-base">
          {t('gym_sub', 'Выбирай формат практики для развития речи, грамматики и словарного запаса.')}
        </p>
      </div>

      {recommendedMode && activeTab === 'classic_quiz' && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100">
          <div className="font-black text-sm">Рекомендованное повторение</div>
          <div className="text-xs sm:text-sm mt-1">Здесь только темы, с которыми вы уже познакомились и которым сейчас нужна практика.</div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-8 bg-white/80 dark:bg-gray-800/80 p-2 rounded-2xl border border-purple-100 dark:border-gray-700 shadow-sm">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                soundEngine.playTileClick();
                setActiveTab(tab.id);
              }}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-md scale-105'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-purple-50 dark:hover:bg-gray-700'
              }`}
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'translation' && <SentenceTranslationSection />}
      {activeTab === 'word_tiles' && <WordTilesSection />}
      {activeTab === 'speed_match' && <SpeedMatchSection />}
      {activeTab === 'error_detective' && <ErrorDetectiveSection />}
      {activeTab === 'verb_drills' && <VerbDrillsSection />}
      {activeTab === 'classic_quiz' && <ClassicQuizSection topicIds={topicIds} />}
    </div>
  );
}
