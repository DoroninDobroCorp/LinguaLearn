import React from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import {
  Sparkles, BookOpen, Settings, Brain, BookMarked, Moon, Sun,
  Map, MessageCircle, Home, Compass
} from 'lucide-react';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { ProfileProvider, useProfile } from './contexts/ProfileContext';
import { LanguageProvider, useLanguage, LanguageSwitcher } from './contexts/LanguageContext';
import TodayDashboard from './components/TodayDashboard';
import Chat from './components/Chat';
import Stories from './components/Stories';
import Exercises from './components/Exercises';
import Vocabulary from './components/Vocabulary';
import SettingsPanel from './components/Settings';
import CurriculumMap from './components/CurriculumMap';
import ProfileSelector from './components/ProfileSelector';
import GamificationHeader from './components/GamificationHeader';

function NavBar() {
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const { t } = useLanguage();

  const navItems = [
    { path: '/', icon: Home, label: t('nav_today', 'Главная') },
    { path: '/stories', icon: BookOpen, label: t('nav_stories', 'Истории') },
    { path: '/chat', icon: MessageCircle, label: t('nav_quests', 'Квесты & Чат') },
    { path: '/exercises', icon: Brain, label: t('nav_exercises', 'Тренажер') },
    { path: '/vocabulary', icon: BookMarked, label: t('nav_vocabulary', 'Словарь') },
    { path: '/curriculum', icon: Map, label: t('nav_curriculum', 'Карта тем') },
    { path: '/settings', icon: Settings, label: t('nav_settings', 'Настройки') },
  ];

  return (
    <nav className="glass-strong border-b shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2.5 flex-shrink-0">
            <div className="relative">
              <Sparkles className="h-7 w-7 text-fuchsia-500 animate-pulse" />
              <div className="absolute inset-0 blur-lg bg-fuchsia-500 opacity-30 animate-pulse"></div>
            </div>
            <span className="text-lg sm:text-xl font-black text-gradient whitespace-nowrap">LinguaLearn 🇪🇸</span>
          </Link>

          {/* Middle: Gamification XP & Streaks Badge */}
          <div className="flex items-center">
            <GamificationHeader />
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center space-x-1">
            {navItems.map(({ path, icon: Icon, label }) => (
              <Link
                key={path}
                to={path}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl transition-all duration-200 text-xs font-bold ${
                  location.pathname === path
                    ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-md scale-105'
                    : 'text-current hover:bg-pink-100 dark:hover:bg-gray-700'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </Link>
            ))}

            <div className="pl-2 border-l border-purple-100 dark:border-gray-700 flex items-center space-x-1.5">
              {/* Language Switcher */}
              <LanguageSwitcher />

              <ProfileSelector />

              <button
                onClick={toggleTheme}
                className="p-2 rounded-xl hover:bg-pink-100 dark:hover:bg-gray-700 transition-all duration-200"
                aria-label="Toggle theme"
              >
                {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-purple-600" />}
              </button>
            </div>
          </div>

          {/* Mobile Header Controls */}
          <div className="flex lg:hidden items-center space-x-1.5">
            <LanguageSwitcher />
            <ProfileSelector />
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg hover:bg-pink-100 dark:hover:bg-gray-700"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-purple-600" />}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

function BottomNavBar() {
  const location = useLocation();
  const { t } = useLanguage();
  const navItems = [
    { path: '/', icon: Home, label: t('nav_today', 'Главная') },
    { path: '/stories', icon: BookOpen, label: t('nav_stories', 'Истории') },
    { path: '/chat', icon: MessageCircle, label: t('nav_quests', 'Квесты') },
    { path: '/exercises', icon: Brain, label: t('nav_exercises', 'Тренажер') },
    { path: '/vocabulary', icon: BookMarked, label: t('nav_vocabulary', 'Словарь') },
    { path: '/curriculum', icon: Map, label: t('nav_curriculum', 'Карта') },
  ];

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 glass-strong border-t shadow-lg h-16 flex items-center justify-around px-1 pb-safe bg-white/90 dark:bg-gray-900/90 backdrop-blur-md">
      {navItems.map(({ path, icon: Icon, label }) => {
        const isActive = location.pathname === path;
        return (
          <Link
            key={path}
            to={path}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-0.5 rounded-xl transition-all ${
              isActive
                ? 'text-fuchsia-500 font-bold scale-105'
                : 'text-slate-500 dark:text-slate-400 font-medium hover:text-fuchsia-400'
            }`}
          >
            <Icon className={`h-4 w-4 mb-0.5 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
            <span className="text-[9px] leading-none">{label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function AppContent() {
  const { isDark } = useTheme();
  const { profileId, profileViewKey } = useProfile();

  return (
    <div className="min-h-screen transition-all duration-300" style={{
      background: isDark ?
        'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' :
        'linear-gradient(135deg, #fdf2f8 0%, #f5d0fe 50%, #fdf2f8 100%)'
    }}>
      <NavBar />

      <main key={profileViewKey} className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 pt-4 pb-20 lg:py-8 animate-fade-in">
        <Routes>
          <Route path="/" element={<TodayDashboard />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/stories" element={<Stories />} />
          <Route path="/curriculum" element={<CurriculumMap />} />
          <Route path="/topics" element={<Navigate to="/curriculum" replace />} />
          <Route path="/exercises" element={<Exercises />} />
          <Route path="/vocabulary" element={<Vocabulary />} />
          <Route path="/settings" element={<SettingsPanel />} />
        </Routes>
      </main>

      <BottomNavBar />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ProfileProvider>
        <LanguageProvider>
          <AppContent />
        </LanguageProvider>
      </ProfileProvider>
    </ThemeProvider>
  );
}

export default App;
