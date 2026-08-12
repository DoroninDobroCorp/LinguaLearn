import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { 
  Sparkles, Target, Brain, Inbox, BookMarked, Headphones, 
  Settings, Award, TrendingUp, CheckCircle2, AlertTriangle, 
  Laptop, ArrowRight, PlayCircle, ShieldCheck
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function TodayDashboard() {
  const { user } = useAuth();
  const [practiceSession, setPracticeSession] = useState(null);
  const [loadingPractice, setLoadingPractice] = useState(true);
  const [deviceTokens, setDeviceTokens] = useState([]);
  const [stats, setStats] = useState({ analyzedCount: 0, weakTopicsCount: 0, improvingCount: 0 });

  useEffect(() => {
    fetchTodayPractice();
    fetchDevices();
    fetchStats();
  }, []);

  const fetchTodayPractice = async () => {
    try {
      const res = await fetch("/english/api/practice/today", { credentials: "same-origin" });
      if (!res.ok && res.status === 404) {
        const res2 = await fetch("/api/practice/today", { credentials: "same-origin" });
        if (res2.ok) {
          const data = await res2.json();
          setPracticeSession(data);
        }
      } else if (res.ok) {
        const data = await res.json();
        setPracticeSession(data);
      }
    } catch (e) {
      console.error("Error fetching today practice:", e);
    } finally {
      setLoadingPractice(false);
    }
  };

  const fetchDevices = async () => {
    try {
      let res = await fetch("/english/api/devices/tokens", { credentials: "same-origin" });
      if (!res.ok && res.status === 404) {
        res = await fetch("/api/devices/tokens", { credentials: "same-origin" });
      }
      if (res.ok) {
        const data = await res.json();
        setDeviceTokens(Array.isArray(data) ? data : data.tokens || []);
      }
    } catch (e) {
      console.error("Error fetching devices:", e);
    }
  };

  const fetchStats = async () => {
    try {
      let res = await fetch("/english/api/writing/samples", { credentials: "same-origin" });
      if (!res.ok && res.status === 404) {
        res = await fetch("/api/writing/samples", { credentials: "same-origin" });
      }
      if (res.ok) {
        const data = await res.json();
        const samples = Array.isArray(data) ? data : data.samples || [];
        setStats((prev) => ({ ...prev, analyzedCount: samples.length }));
      }
    } catch (e) {
      console.error("Error fetching stats:", e);
    }
  };

  const activeDeviceCount = deviceTokens.filter((d) => !d.revoked_at).length;

  return (
    <div className="max-w-7xl mx-auto space-y-8 py-4">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-yellow-500 via-lime-500 to-yellow-400 p-6 sm:p-8 rounded-3xl text-gray-900 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 flex items-center pr-8 pointer-events-none">
          <Sparkles className="h-64 w-64 text-gray-900" />
        </div>
        <div className="relative z-10 space-y-3 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-gray-900/10 text-gray-900 text-xs font-extrabold uppercase tracking-wider">
            <Award className="h-4 w-4" />
            <span>CEFR Level: {user?.cefr_level || "B1"}</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            Today's English Dashboard
          </h1>
          <p className="text-sm sm:text-base text-gray-800 font-medium leading-relaxed">
            Welcome back, <span className="font-bold">{user?.email}</span>! Your real written English automatically powers your daily practice.
          </p>
        </div>
      </div>

      {/* Grid: Daily Practice + Devices & Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Daily Practice Widget (7 cols) */}
        <div className="lg:col-span-7 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg space-y-5">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-3">
            <div className="flex items-center space-x-2">
              <Brain className="h-6 w-6 text-yellow-500" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Daily Practice Session
              </h2>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300">
              Personalized 2-5 min
            </span>
          </div>

          {loadingPractice ? (
            <div className="py-8 text-center text-sm text-gray-500 animate-pulse">
              Loading today's practice topics...
            </div>
          ) : practiceSession ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-yellow-50/70 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/40 space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-yellow-800 dark:text-yellow-300 block">
                  Weak Topics Scraped from Writing Capture:
                </span>
                <div className="flex flex-wrap gap-2">
                  {Array.isArray(practiceSession.topics) && practiceSession.topics.map((t, idx) => (
                    <span key={idx} className="px-3 py-1 rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs font-semibold shadow-sm border border-yellow-200 dark:border-gray-700">
                      🎯 {typeof t === 'string' ? t : t.name || 'Grammar Topic'}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300 pt-1">
                  Session status: <span className="font-bold uppercase text-yellow-600">{practiceSession.status || 'in_progress'}</span> ({practiceSession.exercises?.length || 3} exercises)
                </p>
              </div>

              <Link
                to="/exercises"
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 text-gray-900 font-extrabold text-sm shadow-md hover:scale-102 transition-all flex items-center justify-center space-x-2"
              >
                <PlayCircle className="h-5 w-5 text-gray-900" />
                <span>Start Today's Exercises</span>
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          ) : (
            <div className="py-6 text-center space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Ready for today's practice? Generate exercises targeted to your weak grammar topics.
              </p>
              <Link
                to="/exercises"
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold text-sm shadow-md"
              >
                <Brain className="h-4 w-4" />
                <span>Launch Exercises</span>
              </Link>
            </div>
          )}
        </div>

        {/* Right Column: Stats & Device Health (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Stats Card */}
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white flex items-center space-x-2">
              <TrendingUp className="h-4 w-4 text-lime-500" />
              <span>Capture & Progress Overview</span>
            </h3>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                <span className="text-2xl font-extrabold text-yellow-600 dark:text-yellow-400">{stats.analyzedCount}</span>
                <span className="block text-[11px] text-gray-500 dark:text-gray-400 font-medium">Sentences Analyzed</span>
              </div>
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                <span className="text-2xl font-extrabold text-lime-600 dark:text-lime-400">{user?.cefr_level || "B1"}</span>
                <span className="block text-[11px] text-gray-500 dark:text-gray-400 font-medium">Target Level</span>
              </div>
            </div>
          </div>

          {/* Mac Device Health Card */}
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Laptop className="h-5 w-5 text-purple-500" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Mac Devices Health</h3>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300">
                {activeDeviceCount} Active
              </span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              {activeDeviceCount > 0
                ? `${activeDeviceCount} Mac agent(s) registered and capturing writing.`
                : "No active Mac agents registered yet."}
            </p>
            <Link
              to="/settings"
              className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center space-x-1 pt-1"
            >
              <span>Manage Mac Device Tokens</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

      </div>

      {/* Quick Navigation Cards */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Quick Navigation</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Link
            to="/correction-inbox"
            className="p-4 rounded-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border border-gray-200 dark:border-gray-700 hover:border-yellow-400 shadow-md hover:scale-102 transition-all space-y-2"
          >
            <Inbox className="h-6 w-6 text-yellow-500" />
            <h3 className="font-bold text-sm text-gray-900 dark:text-white">Correction Inbox</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">View diffs & explanations</p>
          </Link>

          <Link
            to="/curriculum"
            className="p-4 rounded-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border border-gray-200 dark:border-gray-700 hover:border-yellow-400 shadow-md hover:scale-102 transition-all space-y-2"
          >
            <Target className="h-6 w-6 text-lime-500" />
            <h3 className="font-bold text-sm text-gray-900 dark:text-white">Curriculum Map</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Track topic mastery</p>
          </Link>

          <Link
            to="/vocabulary"
            className="p-4 rounded-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border border-gray-200 dark:border-gray-700 hover:border-yellow-400 shadow-md hover:scale-102 transition-all space-y-2"
          >
            <BookMarked className="h-6 w-6 text-blue-500" />
            <h3 className="font-bold text-sm text-gray-900 dark:text-white">Vocabulary</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Review saved words</p>
          </Link>

          <Link
            to="/reader"
            className="p-4 rounded-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border border-gray-200 dark:border-gray-700 hover:border-yellow-400 shadow-md hover:scale-102 transition-all space-y-2"
          >
            <Headphones className="h-6 w-6 text-purple-500" />
            <h3 className="font-bold text-sm text-gray-900 dark:text-white">Sync Reader</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">HPMOR & audio practice</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
