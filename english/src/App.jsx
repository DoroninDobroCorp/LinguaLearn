import React from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { MessageCircle, BookOpen, Settings, Brain, BookMarked, Moon, Sun, Sparkles, Map } from 'lucide-react';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import Chat from './components/Chat';
import Exercises from './components/Exercises';
import Vocabulary from './components/Vocabulary';
import SettingsPanel from './components/Settings';
import CurriculumMap from './components/CurriculumMap';

function NavBar() {
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  
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
              <Sparkles className="h-8 w-8 text-yellow-500 animate-pulse" />
              <div className="absolute inset-0 blur-lg bg-yellow-500 opacity-30 animate-pulse"></div>
            </div>
            <span className="text-2xl font-bold text-gradient">English Learning</span>
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-2">
            {navItems.map(({ path, icon: Icon, label }) => (
              <Link
                key={path}
                to={path}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === path
                    ? 'bg-gradient-to-r from-yellow-400 to-lime-400 text-gray-900 shadow-lg scale-105'
                    : 'text-current hover:bg-yellow-100 dark:hover:bg-gray-700'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="font-medium">{label}</span>
              </Link>
            ))}
            
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-yellow-100 dark:hover:bg-gray-700 transition-all duration-200"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>

          {/* Mobile Navigation */}
          <div className="flex md:hidden items-center space-x-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-yellow-100 dark:hover:bg-gray-700"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg hover:bg-yellow-100 dark:hover:bg-gray-700"
              aria-label="Menu"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden pb-4 space-y-2 animate-slide-up">
            {navItems.map(({ path, icon: Icon, label }) => (
              <Link
                key={path}
                to={path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                  location.pathname === path
                    ? 'bg-gradient-to-r from-yellow-400 to-lime-400 text-gray-900 shadow-lg'
                    : 'text-current hover:bg-yellow-100 dark:hover:bg-gray-700'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="font-medium">{label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}

function AppContent() {
  const { isDark } = useTheme();
  
  return (
    <div className="min-h-screen transition-all duration-300" style={{ 
      background: isDark ? 
        'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' : 
        'linear-gradient(135deg, #fef3c7 0%, #d9f99d 50%, #fef3c7 100%)'
    }}>
      <NavBar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
        <Routes>
          <Route path="/" element={<Chat />} />
          <Route path="/curriculum" element={<CurriculumMap />} />
          <Route path="/topics" element={<Navigate to="/curriculum" replace />} />
          <Route path="/exercises" element={<Exercises />} />
          <Route path="/vocabulary" element={<Vocabulary />} />
          <Route path="/settings" element={<SettingsPanel />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
