import React from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { MessageCircle, BookOpen, Settings, Brain, BookMarked, Moon, Sun, Sparkles, Map } from 'lucide-react';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { ProfileProvider, useProfile } from './contexts/ProfileContext';
import Chat from './components/Chat';
import Exercises from './components/Exercises';
import Vocabulary from './components/Vocabulary';
import SettingsPanel from './components/Settings';
import CurriculumMap from './components/CurriculumMap';
import ProfileSelector from './components/ProfileSelector';

function NavBar() {
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  
  const navItems = [
    { path: '/', icon: MessageCircle, label: 'Chat' },
    { path: '/curriculum', icon: Map, label: 'Curriculum' },
    { path: '/exercises', icon: Brain, label: 'Exercises' },
    { path: '/vocabulary', icon: BookMarked, label: 'Vocabulary' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <nav className="glass-strong border-b shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Sparkles className="h-8 w-8 text-fuchsia-500 animate-pulse" />
              <div className="absolute inset-0 blur-lg bg-fuchsia-500 opacity-30 animate-pulse"></div>
            </div>
            <span className="text-2xl font-bold text-gradient">Spanish Learning</span>
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-2">
            {navItems.map(({ path, icon: Icon, label }) => (
              <Link
                key={path}
                to={path}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === path
                    ? 'bg-gradient-to-r from-fuchsia-400 to-purple-400 text-gray-900 shadow-lg scale-105'
                    : 'text-current hover:bg-pink-100 dark:hover:bg-gray-700'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="font-medium">{label}</span>
              </Link>
            ))}
            
            <ProfileSelector />
            
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-pink-100 dark:hover:bg-gray-700 transition-all duration-200"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>

          {/* Mobile Header Controls (Simple & clean) */}
          <div className="flex md:hidden items-center space-x-2">
            <ProfileSelector />
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-pink-100 dark:hover:bg-gray-700"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

function BottomNavBar() {
  const location = useLocation();
  const navItems = [
    { path: '/', icon: MessageCircle, label: 'Chat' },
    { path: '/curriculum', icon: Map, label: 'Curriculum' },
    { path: '/exercises', icon: Brain, label: 'Exercises' },
    { path: '/vocabulary', icon: BookMarked, label: 'Vocabulary' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-strong border-t shadow-lg h-16 flex items-center justify-around px-2 pb-safe">
      {navItems.map(({ path, icon: Icon, label }) => {
        const isActive = location.pathname === path;
        return (
          <Link
            key={path}
            to={path}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all ${
              isActive
                ? 'text-fuchsia-500 font-bold scale-105'
                : 'text-slate-500 dark:text-slate-400 font-medium hover:text-fuchsia-400'
            }`}
          >
            <Icon className={`h-5 w-5 mb-0.5 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
            <span className="text-[10px] sm:text-xs leading-none">{label}</span>
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
      
      {/* key={profileViewKey} forces a full remount whenever the active profile changes
          or regains session access, preventing stale locked/error states from sticking. */}
      <main key={profileViewKey} className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 pt-4 pb-20 md:py-8 animate-fade-in">
        <Routes>
          <Route path="/" element={<Chat />} />
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
        <AppContent />
      </ProfileProvider>
    </ThemeProvider>
  );
}

export default App;
