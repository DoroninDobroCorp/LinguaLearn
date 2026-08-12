import React from "react";
import { Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import { MessageCircle, Headphones, Settings, Brain, BookMarked, Moon, Sun, Sparkles, Map, Inbox, LogOut, User } from "lucide-react";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ProtectedRoute, PublicOnlyRoute } from "./components/ProtectedRoute";
import Chat from "./components/Chat";
import Exercises from "./components/Exercises";
import Vocabulary from "./components/Vocabulary";
import SettingsPanel from "./components/Settings";
import CurriculumMap from "./components/CurriculumMap";
import SyncReader from "./components/SyncReader";
import CorrectionInbox from "./components/CorrectionInbox";
import Login from "./components/Login";

function NavBar() {
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  
  const navItems = [
    { path: "/", icon: MessageCircle, label: "Chat" },
    { path: "/correction-inbox", icon: Inbox, label: "Correction Inbox" },
    { path: "/curriculum", icon: Map, label: "Curriculum" },
    { path: "/exercises", icon: Brain, label: "Exercises" },
    { path: "/vocabulary", icon: BookMarked, label: "Vocabulary" },
    { path: "/reader", icon: Headphones, label: "Reader" },
    { path: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <nav className="glass-strong border-b shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-3">
            <div className="relative">
              <Sparkles className="h-8 w-8 text-yellow-500 animate-pulse" />
              <div className="absolute inset-0 blur-lg bg-yellow-500 opacity-30 animate-pulse"></div>
            </div>
            <span className="text-2xl font-bold text-gradient">English Learning</span>
          </Link>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-2">
            {user && navItems.map(({ path, icon: Icon, label }) => (
              <Link
                key={path}
                to={path}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === path
                    ? "bg-gradient-to-r from-yellow-400 to-lime-400 text-gray-900 shadow-lg scale-105"
                    : "text-current hover:bg-yellow-100 dark:hover:bg-gray-700"
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

            {user ? (
              <div className="flex items-center space-x-3 ml-2 pl-3 border-l border-gray-300 dark:border-gray-700">
                <div className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300">
                  <User className="h-3.5 w-3.5" />
                  <span className="max-w-[140px] truncate">{user.email}</span>
                </div>
                <button
                  onClick={logout}
                  className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all duration-200 flex items-center space-x-1"
                  title="Log Out"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-yellow-400 to-lime-400 text-gray-900 font-bold text-sm shadow-md hover:scale-105 transition-all"
              >
                Sign In
              </Link>
            )}
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
            {user && (
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
            )}
          </div>
        </div>

        {/* Mobile Menu */}
        {user && mobileMenuOpen && (
          <div className="md:hidden pb-4 space-y-2 animate-slide-up">
            <div className="px-4 py-2 mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
              <span className="truncate">{user.email}</span>
              <button
                onClick={logout}
                className="text-red-500 hover:underline flex items-center space-x-1"
              >
                <LogOut className="h-4 w-4" />
                <span>Log Out</span>
              </button>
            </div>
            {navItems.map(({ path, icon: Icon, label }) => (
              <Link
                key={path}
                to={path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                  location.pathname === path
                    ? "bg-gradient-to-r from-yellow-400 to-lime-400 text-gray-900 shadow-lg"
                    : "text-current hover:bg-yellow-100 dark:hover:bg-gray-700"
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
        "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)" : 
        "linear-gradient(135deg, #fef3c7 0%, #d9f99d 50%, #fef3c7 100%)"
    }}>
      <NavBar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
        <Routes>
          <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />

          <Route path="/" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
          <Route path="/curriculum" element={<ProtectedRoute><CurriculumMap /></ProtectedRoute>} />
          <Route path="/topics" element={<Navigate to="/curriculum" replace />} />
          <Route path="/exercises" element={<ProtectedRoute><Exercises /></ProtectedRoute>} />
          <Route path="/vocabulary" element={<ProtectedRoute><Vocabulary /></ProtectedRoute>} />
          <Route path="/correction-inbox" element={<ProtectedRoute><CorrectionInbox /></ProtectedRoute>} />
          <Route path="/inbox" element={<Navigate to="/correction-inbox" replace />} />
          <Route path="/reader" element={<ProtectedRoute><SyncReader /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPanel /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
