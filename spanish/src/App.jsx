import React from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import {
  Sparkles, BookOpen, Settings, Brain, BookMarked, Moon, Sun,
  Map, MessageCircle, Home, Compass, Dumbbell, Target
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
import CoachHome from './components/coach/CoachHome';
import CoachStart from './components/coach/CoachStart';
import CoachChat from './components/coach/CoachChat';
import CoachCall from './components/coach/CoachCall';
import CoachReport from './components/coach/CoachReport';
import CoachWorkout, { WorkoutLauncher } from './components/coach/CoachWorkout';
import { CoachSpotsList, CoachSpotDetail } from './components/coach/CoachSpots';
import CoachSettings from './components/coach/CoachSettings';
import { secureAppUrl } from './utils/coachApi';

// Adult conversation learners (B1+) get the coach as their home and a
// focused navigation instead of the A1 course.
function useConversationTrack() {
  const { activeProfile } = useProfile();
  return activeProfile?.learning_track === 'conversation';
}

const COACH_NAV_ITEMS = [
  { path: '/', icon: Home, label: 'Главная' },
  { path: '/coach/new', icon: MessageCircle, label: 'Разговор' },
  { path: '/coach/workout', icon: Dumbbell, label: 'Тренировка' },
  { path: '/coach/spots', icon: Target, label: 'Мои темы' },
  { path: '/vocabulary', icon: BookMarked, label: 'Словарь' },
  { path: '/coach/settings', icon: Settings, label: 'Настройки' },
];

function isNavActive(pathname, path) {
  if (path === '/') return pathname === '/';
  if (path === '/coach/new') return pathname.startsWith('/coach/new') || pathname.startsWith('/coach/chat') || pathname.startsWith('/coach/call') || pathname.startsWith('/coach/report');
  return pathname === path || pathname.startsWith(`${path}/`);
}

function NavBar() {
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const conversationTrack = useConversationTrack();

  const navItems = conversationTrack ? COACH_NAV_ITEMS : [
    { path: '/', icon: Home, label: t('nav_today', 'Главная') },
    { path: '/maya-verbs', icon: Sparkles, label: '🎈 Урок Майи' },
    { path: '/stories', icon: BookOpen, label: t('nav_stories', 'Истории') },
    { path: '/chat', icon: MessageCircle, label: t('nav_quests', 'Квесты & Чат') },
    { path: '/exercises', icon: Brain, label: t('nav_exercises', 'Тренажер') },
    { path: '/vocabulary', icon: BookMarked, label: t('nav_vocabulary', 'Словарь') },
    { path: '/curriculum', icon: Map, label: t('nav_curriculum', 'Карта тем') },
    { path: '/settings', icon: Settings, label: t('nav_settings', 'Настройки') },
  ];

  return (
    <nav
      className="glass-strong border-b shadow-lg sticky top-0 z-50"
      style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 8px)" }}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14 sm:h-16 gap-2">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-1.5 sm:space-x-2.5 flex-shrink-0">
            <div className="relative">
              <Sparkles className="h-6 w-6 sm:h-7 sm:w-7 text-fuchsia-500 animate-pulse" />
              <div className="absolute inset-0 blur-lg bg-fuchsia-500 opacity-30 animate-pulse"></div>
            </div>
            <span className="text-base sm:text-xl font-black text-gradient whitespace-nowrap">LinguaLearn 🇪🇸</span>
          </Link>

          {/* Middle: Gamification XP & Streaks Badge */}
          {/* Kids' daily quests (stories, speed match…) don't apply to the conversation track. */}
          {!conversationTrack && (
            <div className="flex items-center flex-shrink-0">
              <GamificationHeader />
            </div>
          )}

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center space-x-1">
            {navItems.map(({ path, icon: Icon, label }) => (
              <Link
                key={path}
                to={path}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl transition-all duration-200 text-xs font-bold ${
                  (conversationTrack ? isNavActive(location.pathname, path) : location.pathname === path)
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
              {!conversationTrack && <LanguageSwitcher />}

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
          <div className="flex lg:hidden items-center space-x-1 sm:space-x-1.5 flex-shrink-0">
            {!conversationTrack && <LanguageSwitcher />}
            <ProfileSelector />
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-xl hover:bg-pink-100 dark:hover:bg-gray-700 active:scale-95 text-gray-700 dark:text-gray-200"
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
  const conversationTrack = useConversationTrack();
  const navItems = conversationTrack ? COACH_NAV_ITEMS.filter((item) => item.path !== '/coach/settings') : [
    { path: '/', icon: Home, label: t('nav_today', 'Главная') },
    { path: '/maya-verbs', icon: Sparkles, label: 'Урок Майи' },
    { path: '/exercises', icon: Brain, label: t('nav_exercises', 'Тренажер') },
    { path: '/vocabulary', icon: BookMarked, label: t('nav_vocabulary', 'Словарь') },
    { path: '/stories', icon: BookOpen, label: t('nav_stories', 'Истории') },
    { path: '/settings', icon: Settings, label: t('nav_settings', 'Настройки') },
  ];

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 glass-strong border-t border-purple-200/50 dark:border-gray-800 shadow-2xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-md flex items-center justify-around px-1"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
        paddingTop: '6px',
        minHeight: 'calc(3.75rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {navItems.map(({ path, icon: Icon, label }) => {
        const isActive = conversationTrack
          ? isNavActive(location.pathname, path)
          : location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
        return (
          <Link
            key={path}
            to={path}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-2xl transition-all duration-200 active:scale-95 ${
              isActive
                ? 'text-fuchsia-600 dark:text-fuchsia-400 font-extrabold scale-105'
                : 'text-slate-500 dark:text-slate-400 font-medium hover:text-fuchsia-500'
            }`}
          >
            <div className={`p-1 rounded-xl transition-colors ${isActive ? 'bg-fuchsia-100 dark:bg-fuchsia-950/60' : ''}`}>
              <Icon className={`h-5 w-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight font-bold">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function AppContent() {
  const { isDark } = useTheme();
  const { profileId, profileViewKey, loading: profilesLoading } = useProfile();
  const conversationTrack = useConversationTrack();
  const location = useLocation();

  // Voice needs a secure page: move the conversation track off the plain-http IP.
  React.useEffect(() => {
    if (profilesLoading) return;
    if (!conversationTrack && !location.pathname.startsWith('/coach')) return;
    const secureUrl = secureAppUrl(profileId);
    if (secureUrl) window.location.replace(secureUrl);
  }, [profilesLoading, conversationTrack, location.pathname, profileId]);

  const [isOffline, setIsOffline] = React.useState(() => typeof navigator !== "undefined" && !navigator.onLine);

  React.useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div className="min-h-screen transition-all duration-300" style={{
      background: isDark ?
        'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' :
        'linear-gradient(135deg, #fdf2f8 0%, #f5d0fe 50%, #fdf2f8 100%)'
    }}>
      <NavBar />
      {isOffline && (
        <div className="bg-amber-600 text-white text-xs font-bold py-1.5 px-4 text-center shadow-md flex items-center justify-center gap-2 sticky top-16 z-40 animate-fadeIn">
          <span>📴 Офлайн-режим</span>
          <span className="opacity-90 font-medium">— доступны тренировка слов, глаголы, когнаты (слова из англ.) и офлайн-пак 100 предложений</span>
        </div>
      )}

      <main
        key={profileViewKey}
        className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-3 sm:pt-4 lg:py-8 animate-fade-in"
        style={{
          paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom, 16px))',
        }}
      >
        <Routes>
          <Route path="/" element={profilesLoading ? null : conversationTrack ? <CoachHome /> : <TodayDashboard />} />
          <Route path="/coach" element={<CoachHome />} />
          <Route path="/coach/new" element={<CoachStart />} />
          <Route path="/coach/chat/:sessionId" element={<CoachChat />} />
          <Route path="/coach/call/:sessionId" element={<CoachCall />} />
          <Route path="/coach/report/:sessionId" element={<CoachReport />} />
          <Route path="/coach/workout" element={<WorkoutLauncher />} />
          <Route path="/coach/workout/:workoutId" element={<CoachWorkout />} />
          <Route path="/coach/spots" element={<CoachSpotsList />} />
          <Route path="/coach/spots/:spotId" element={<CoachSpotDetail />} />
          <Route path="/coach/settings" element={<CoachSettings />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/stories" element={<Stories />} />
          <Route path="/curriculum" element={<CurriculumMap />} />
          <Route path="/topics" element={<Navigate to="/curriculum?tab=all_topics" replace />} />
          <Route path="/maya-verbs" element={<Navigate to="/exercises?tab=maya_verbs" replace />} />
          <Route path="/maya-pronouns" element={<Navigate to="/exercises?tab=maya_pronouns" replace />} />
          <Route path="/maya-sentences" element={<Navigate to="/exercises?tab=maya_sentences" replace />} />
          <Route path="/maya-training" element={<Navigate to="/exercises?tab=maya_sentences" replace />} />
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
