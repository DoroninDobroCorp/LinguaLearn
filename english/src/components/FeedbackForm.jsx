import React, { useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { 
  MessageSquare, Send, CheckCircle2, AlertCircle, RefreshCw, 
  Bug, Sparkles, Lightbulb, Compass, HelpCircle, ArrowLeft 
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const FEEDBACK_CATEGORIES = [
  { id: "bug", label: "Bug Report", icon: Bug, desc: "Something isn't working as expected" },
  { id: "bad_correction", label: "Bad Correction", icon: AlertCircle, desc: "Grammar explanation or diff was incorrect" },
  { id: "ux_feedback", label: "UX & Usability", icon: Lightbulb, desc: "Design, navigation, or usability suggestions" },
  { id: "feature_request", label: "Feature Request", icon: Sparkles, desc: "Ideas for new features or capabilities" },
  { id: "other", label: "General Feedback", icon: HelpCircle, desc: "Any other comments or feedback" },
];

const APP_VERSION = "1.0.0-beta";

export default function FeedbackForm() {
  const { user } = useAuth();
  const location = useLocation();

  const [category, setCategory] = useState("ux_feedback");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Route metadata: auto-detect current or previous route
  const currentRoute = location.pathname || "/feedback";

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) {
      setErrorMsg("Please enter your feedback message.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    const payload = {
      category,
      message: trimmed,
      route: currentRoute,
      app_version: APP_VERSION,
    };

    try {
      let res = await fetch("/english/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        res = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        setSuccessMsg("Thank you for your feedback! Your report has been submitted.");
        setMessage("");
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMsg(err.error || "Failed to submit feedback. Please try again.");
      }
    } catch (err) {
      setErrorMsg(err.message || "Network error while submitting feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in" data-testid="feedback-form-container">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="text-sm font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center space-x-1"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Dashboard</span>
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 sm:p-8 space-y-6 border border-gray-100 dark:border-gray-700">
        <div className="flex items-center space-x-3">
          <div className="p-3 rounded-2xl bg-gradient-to-r from-yellow-400 to-lime-400 text-gray-900 shadow-md">
            <MessageSquare className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">Beta Feedback</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Help us make LinguaLearn better. Share bug reports, corrections, or ideas.
            </p>
          </div>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 flex items-start space-x-3" data-testid="feedback-success-alert">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">{successMsg}</p>
              <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">
                Our team reviews beta feedback regularly to improve the analysis engine and learning features.
              </p>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm font-semibold flex items-center space-x-2" data-testid="feedback-error-alert">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Category Selector */}
          <div>
            <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">
              Feedback Category
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="category-options">
              {FEEDBACK_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    data-testid={`category-option-${cat.id}`}
                    className={`p-3.5 rounded-xl border text-left transition-all flex items-start space-x-3 ${
                      isSelected
                        ? "bg-gradient-to-r from-yellow-50 to-lime-50 dark:bg-yellow-950/30 border-yellow-400 dark:border-yellow-500 shadow-sm scale-[1.02]"
                        : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750"
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${isSelected ? "bg-yellow-400 text-gray-900" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-900 dark:text-white">
                        {cat.label}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {cat.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Feedback Message */}
          <div>
            <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-2">
              Feedback Details <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe what happened, what you expected, or how we can improve LinguaLearn..."
              data-testid="feedback-message-textarea"
              className="w-full p-4 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-yellow-400 outline-none text-sm transition-all resize-none"
              required
            />
          </div>

          {/* Auto-attached Client Metadata Card */}
          <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700/80 text-xs text-gray-500 dark:text-gray-400 space-y-1.5" data-testid="auto-attached-telemetry">
            <div className="font-semibold text-gray-700 dark:text-gray-300 flex items-center space-x-1.5">
              <Compass className="h-3.5 w-3.5 text-yellow-500" />
              <span>Auto-attached Diagnostics</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1 font-mono">
              <span className="px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                Route: {currentRoute}
              </span>
              <span className="px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                App Version: {APP_VERSION}
              </span>
              {user?.email && (
                <span className="px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                  User: {user.email}
                </span>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !message.trim()}
              data-testid="submit-feedback-btn"
              className="px-8 py-3 rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 text-gray-900 font-extrabold text-sm shadow-lg hover:scale-105 transition-all flex items-center space-x-2 disabled:opacity-50 disabled:hover:scale-100"
            >
              {submitting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>Submit Feedback</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
