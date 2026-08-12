import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Sparkles, ShieldCheck, KeyRound, Lock, CheckCircle2, 
  Zap, BookOpen, UserCheck, ArrowRight, Clock, Sliders, 
  Database, AlertCircle, Mail, Globe, Brain 
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const { login, signup, error, setError } = useAuth();
  const navigate = useNavigate();

  const [isSignup, setIsSignup] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    setError(null);
    setSubmitting(true);

    if (!email || !password) {
      setFormError("Please fill in email and password.");
      setSubmitting(false);
      return;
    }

    if (isSignup && !inviteCode) {
      setFormError("Please enter your invite code.");
      setSubmitting(false);
      return;
    }

    try {
      let res;
      if (isSignup) {
        res = await signup(email, password, inviteCode);
      } else {
        res = await login(email, password);
      }

      if (res.success) {
        if (isSignup || !res.user?.onboarding_completed) {
          navigate("/onboarding", { replace: true });
        } else {
          navigate("/", { replace: true });
        }
      } else {
        setFormError(res.error || "Authentication failed.");
      }
    } catch (err) {
      setFormError(err.message || "An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = formError || error;

  return (
    <div className="max-w-6xl mx-auto space-y-12 py-4">
      {/* Hero / Header */}
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 text-xs font-semibold tracking-wide uppercase">
          <Sparkles className="h-4 w-4 text-yellow-500" />
          <span>LinguaLearn English Closed Beta</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight leading-tight">
          My real everyday written English automatically becomes my{" "}
          <span className="text-gradient">personalized learning program</span>.
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 leading-relaxed">
          Designed specifically for B1–B2 English learners. Transform your daily Slack messages, emails, 
          and Telegram chats into evidence-based grammar progress and targeted practice sessions.
        </p>
      </div>

      {/* Main Grid: Form + Features */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Invite Code / Login Form (5 cols) */}
        <div className="lg:col-span-5 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl">
          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
            <button
              type="button"
              onClick={() => { setIsSignup(true); setFormError(""); setError(null); }}
              className={`flex-1 pb-3 text-sm font-semibold text-center transition-all ${
                isSignup
                  ? "border-b-2 border-yellow-500 text-yellow-600 dark:text-yellow-400 font-bold"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              Activate Invite Code
            </button>
            <button
              type="button"
              onClick={() => { setIsSignup(false); setFormError(""); setError(null); }}
              className={`flex-1 pb-3 text-sm font-semibold text-center transition-all ${
                !isSignup
                  ? "border-b-2 border-yellow-500 text-yellow-600 dark:text-yellow-400 font-bold"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              Sign In
            </button>
          </div>

          {displayError && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 flex items-start space-x-3 text-red-700 dark:text-red-300 text-sm">
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500 mt-0.5" />
              <div>
                <span className="font-semibold">Authentication Error</span>
                <p className="mt-0.5">{displayError}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignup && (
              <div>
                <label htmlFor="invite-code" className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                  Invite Code <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    id="invite-code"
                    name="inviteCode"
                    type="text"
                    required={isSignup}
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="e.g. BETA-2026-INVITE"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-yellow-500 uppercase tracking-widest font-mono text-sm"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  LinguaLearn English is currently invite-only for beta testers.
                </p>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                Email Address <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-yellow-500 text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-yellow-500 text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 text-gray-900 font-bold hover:shadow-lg hover:scale-[1.01] transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 mt-6"
            >
              {submitting ? (
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-gray-900"></div>
              ) : (
                <>
                  <span>{isSignup ? "Activate Invite & Join Beta" : "Sign In to LinguaLearn"}</span>
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 text-center">
            <button
              type="button"
              onClick={() => { setIsSignup(!isSignup); setFormError(""); setError(null); }}
              className="text-xs font-medium text-yellow-600 dark:text-yellow-400 hover:underline"
            >
              {isSignup
                ? "Already registered? Click here to sign in."
                : "Have an invite code? Click here to activate."}
            </button>
          </div>
        </div>

        {/* Right Column: Product Explanation & Features (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-md p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center space-x-2">
              <Brain className="h-6 w-6 text-yellow-500" />
              <span>How LinguaLearn English Works</span>
            </h2>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 mt-1">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Everyday Written English Capture</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    Captures your actual written English from macOS desktop apps (Telegram, Slack, WhatsApp, GitHub, Email).
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-lime-100 dark:bg-lime-900/40 text-lime-700 dark:text-lime-300 mt-1">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Instant Gemini 2.5 AI Analysis & Russian Explanations</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    Analyzes grammar, syntax, and word choice in real time. Highlights errors with visual diffs and clear explanations in Russian.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 mt-1">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Evidence-Based Mastery & Daily Practice</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    Tracks recurring weak spots across CEFR B1-C2 curriculum topics. Automatically generates 2–5 minute daily practice sessions.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Privacy Summary Card */}
          <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-md p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center space-x-2">
              <ShieldCheck className="h-6 w-6 text-green-500" />
              <span>Privacy Summary & Data Rights</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                <div className="flex items-center space-x-2 font-semibold text-xs text-gray-900 dark:text-white mb-1">
                  <Clock className="h-4 w-4 text-yellow-500" />
                  <span>Configurable Retention</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Raw text retention set to 0, 7, or 30 days (default 7). Original text is auto-purged while keeping grammar insights.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                <div className="flex items-center space-x-2 font-semibold text-xs text-gray-900 dark:text-white mb-1">
                  <Sliders className="h-4 w-4 text-green-500" />
                  <span>App Control & Pause</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Configure app allowlist/denylist preferences to ignore private apps, or pause capture instantly at any time.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                <div className="flex items-center space-x-2 font-semibold text-xs text-gray-900 dark:text-white mb-1">
                  <Database className="h-4 w-4 text-blue-500" />
                  <span>Strict Data Isolation</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Every user account is strictly isolated at database level. Device tokens are hashed and easily revocable.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                <div className="flex items-center space-x-2 font-semibold text-xs text-gray-900 dark:text-white mb-1">
                  <UserCheck className="h-4 w-4 text-purple-500" />
                  <span>Export & Account Deletion</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Full 1-click JSON data export and permanent account deletion cascading across all tables.
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
