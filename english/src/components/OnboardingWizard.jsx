import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Sparkles, CheckCircle2, ShieldCheck, Laptop, KeyRound, 
  ArrowRight, ArrowLeft, Copy, Check, AlertCircle, RefreshCw,
  BookOpen, Eye, Lock, Layers, PlayCircle, Award
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const CEFR_LEVELS = [
  { level: "A1", title: "A1 - Beginner", desc: "Basic phrases, simple sentences, everyday greetings." },
  { level: "A2", title: "A2 - Elementary", desc: "Basic routines, familiar topics, short everyday texts." },
  { level: "B1", title: "B1 - Intermediate", desc: "Main points of clear standard input, work & leisure texts." },
  { level: "B2", title: "B2 - Upper Intermediate", desc: "Complex texts, fluent conversation, detailed explanations." },
  { level: "C1", title: "C1 - Advanced", desc: "Flexible language use, academic and professional fluency." },
  { level: "C2", title: "C2 - Proficient", desc: "Near-native precision, subtle nuances, effortless expression." },
];

const DESKTOP_APPS = [
  { id: "Telegram", name: "Telegram Desktop", icon: "💬" },
  { id: "Slack", name: "Slack", icon: "📢" },
  { id: "WhatsApp", name: "WhatsApp Desktop", icon: "💚" },
  { id: "Mail", name: "Apple Mail & Email", icon: "✉️" },
  { id: "Chrome", name: "Google Chrome", icon: "🌐" },
  { id: "Safari", name: "Safari", icon: "🧭" },
  { id: "Obsidian", name: "Obsidian / Notes", icon: "📝" },
  { id: "Xcode", name: "Xcode / IDEs", icon: "💻" },
];

export default function OnboardingWizard() {
  const { user, checkAuth } = useAuth();
  const navigate = useNavigate();

  // Initialize step from user settings or localStorage
  const savedStep = Number(localStorage.getItem("onboarding_step") || user?.onboarding_step || 1);
  const [currentStep, setCurrentStep] = useState(savedStep > 5 ? 5 : Math.max(1, savedStep));
  const [maxAllowedStep, setMaxAllowedStep] = useState(savedStep > 5 ? 5 : Math.max(1, savedStep));
  
  // Step 1 State
  const [selectedLevel, setSelectedLevel] = useState(user?.cefr_level || "B1");

  // Step 2 State
  const [retentionDays, setRetentionDays] = useState(7);
  const [agreedPrivacy, setAgreedPrivacy] = useState(true);

  // Step 3 State
  const [allowAllApps, setAllowAllApps] = useState(true);
  const [allowedApps, setAllowedApps] = useState(["Telegram", "Slack", "WhatsApp", "Mail", "Chrome"]);

  // Step 4 State
  const [deviceName, setDeviceName] = useState("Work MacBook");
  const [createdToken, setCreatedToken] = useState("");
  const [tokenCopied, setTokenCopied] = useState(false);
  const [creatingToken, setCreatingToken] = useState(false);

  // Step 5 State
  const [testSentence, setTestSentence] = useState("I has been studying English for two years.");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // Sync current step with localStorage and user state
    if (user?.onboarding_step) {
      const uStep = Number(user.onboarding_step);
      if (uStep <= 5 && uStep > maxAllowedStep) {
        setMaxAllowedStep(uStep);
      }
    }
  }, [user]);

  const updateServerSettings = async (data) => {
    setSaving(true);
    setErrorMsg("");
    try {
      const res = await fetch("/english/api/user/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const settings = await res.json();
        await checkAuth();
        return { success: true, settings };
      } else {
        const err = await res.json();
        setErrorMsg(err.error || "Failed to update settings");
        return { success: false };
      }
    } catch (err) {
      setErrorMsg(err.message || "Network error");
      return { success: false };
    } finally {
      setSaving(false);
    }
  };

  const handleStepNavigation = (targetStep) => {
    if (targetStep > maxAllowedStep) {
      setErrorMsg(`Please complete Step ${currentStep} before advancing.`);
      return;
    }
    setErrorMsg("");
    setCurrentStep(targetStep);
    localStorage.setItem("onboarding_step", String(targetStep));
  };

  // Step 1: Level Submit
  const handleStep1Submit = async (e) => {
    e.preventDefault();
    const res = await updateServerSettings({
      cefr_level: selectedLevel,
      max_level: selectedLevel,
      onboarding_step: 2,
    });
    if (res.success) {
      setMaxAllowedStep((prev) => Math.max(prev, 2));
      setCurrentStep(2);
      localStorage.setItem("onboarding_step", "2");
    }
  };

  // Step 2: Privacy Submit
  const handleStep2Submit = async (e) => {
    e.preventDefault();
    if (!agreedPrivacy) {
      setErrorMsg("Please agree to the privacy policy to continue.");
      return;
    }
    const res = await updateServerSettings({
      raw_text_retention_days: Number(retentionDays),
      onboarding_step: 3,
    });
    if (res.success) {
      setMaxAllowedStep((prev) => Math.max(prev, 3));
      setCurrentStep(3);
      localStorage.setItem("onboarding_step", "3");
    }
  };

  // Step 3: App Selection Submit
  const handleStep3Submit = async (e) => {
    e.preventDefault();
    const appsStr = allowAllApps ? "ALL" : allowedApps.join(",");
    const res = await updateServerSettings({
      allowed_apps: appsStr,
      onboarding_step: 4,
    });
    if (res.success) {
      setMaxAllowedStep((prev) => Math.max(prev, 4));
      setCurrentStep(4);
      localStorage.setItem("onboarding_step", "4");
    }
  };

  // Step 4: Device Token Creation
  const handleGenerateToken = async () => {
    setCreatingToken(true);
    setErrorMsg("");
    try {
      const res = await fetch("/english/api/devices/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ device_name: deviceName || "My Mac" }),
      });
      if (res.ok) {
        const data = await res.json();
        setCreatedToken(data.token);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || "Failed to create device token");
      }
    } catch (err) {
      setErrorMsg(err.message || "Network error");
    } finally {
      setCreatingToken(false);
    }
  };

  const handleStep4Submit = async (e) => {
    e.preventDefault();
    const res = await updateServerSettings({ onboarding_step: 5 });
    if (res.success) {
      setMaxAllowedStep((prev) => Math.max(prev, 5));
      setCurrentStep(5);
      localStorage.setItem("onboarding_step", "5");
    }
  };

  // Step 5: Test Sentence Analysis
  const handleRunTestAnalysis = async () => {
    if (!testSentence.trim()) return;
    setAnalyzing(true);
    setErrorMsg("");
    try {
      const res = await fetch("/english/api/writing/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          text: testSentence,
          source_app: "OnboardingTest",
          preview_only: 0,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAnalysisResult(data);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || "Analysis failed");
      }
    } catch (err) {
      setErrorMsg(err.message || "Network error during analysis");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFinishOnboarding = async () => {
    const res = await updateServerSettings({
      onboarding_completed: 1,
      onboarding_step: 6,
    });
    if (res.success) {
      localStorage.removeItem("onboarding_step");
      navigate("/", { replace: true });
    }
  };

  const stepsList = [
    { num: 1, label: "Level Selection", icon: Award },
    { num: 2, label: "Privacy Explanation", icon: ShieldCheck },
    { num: 3, label: "App Selection", icon: Layers },
    { num: 4, label: "Device Token Creation", icon: KeyRound },
    { num: 5, label: "First Test Sentence", icon: Sparkles },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-4">
      {/* Header Banner */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 text-xs font-semibold uppercase tracking-wider">
          <Sparkles className="h-4 w-4 text-yellow-500" />
          <span>Beta Onboarding Wizard</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold text-gray-900 dark:text-white">
          Welcome to LinguaLearn English
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 max-w-xl mx-auto">
          Let's personalize your learning experience, configure privacy controls, and set up your Mac capture agent.
        </p>
      </div>

      {/* Step Indicator Bar */}
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md">
        <div className="grid grid-cols-5 gap-2 sm:gap-4">
          {stepsList.map(({ num, label, icon: Icon }) => {
            const isCompleted = num < currentStep || (num <= maxAllowedStep && num !== currentStep);
            const isActive = num === currentStep;
            const isBlocked = num > maxAllowedStep;

            return (
              <button
                key={num}
                type="button"
                onClick={() => handleStepNavigation(num)}
                disabled={isBlocked}
                className={`flex flex-col items-center p-2 sm:p-3 rounded-xl transition-all ${
                  isActive
                    ? "bg-yellow-100 dark:bg-yellow-900/50 border-2 border-yellow-500 text-yellow-900 dark:text-yellow-200 font-bold shadow-md scale-105"
                    : isCompleted
                    ? "bg-lime-50 dark:bg-lime-900/30 text-lime-800 dark:text-lime-300 border border-lime-300 dark:border-lime-700 hover:bg-lime-100"
                    : "bg-gray-50 dark:bg-gray-700/50 text-gray-400 opacity-60 cursor-not-allowed"
                }`}
              >
                <div className="flex items-center justify-center h-8 w-8 rounded-full mb-1 bg-current text-white dark:text-gray-900 font-bold text-xs">
                  {isCompleted && !isActive ? (
                    <CheckCircle2 className="h-5 w-5 text-lime-600 dark:text-lime-400" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <span className="text-[10px] sm:text-xs text-center line-clamp-1">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 flex items-start space-x-3 text-red-700 dark:text-red-300 text-sm animate-shake">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500 mt-0.5" />
          <p>{errorMsg}</p>
        </div>
      )}

      {/* STEP 1: Level Selection */}
      {currentStep === 1 && (
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl space-y-6 animate-fade-in">
          <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center space-x-2">
              <Award className="h-6 w-6 text-yellow-500" />
              <span>Step 1: Select Your CEFR English Level</span>
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
              Select your current proficiency level to customize curriculum topics and practice recommendations.
            </p>
          </div>

          <form onSubmit={handleStep1Submit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {CEFR_LEVELS.map(({ level, title, desc }) => (
                <div
                  key={level}
                  onClick={() => setSelectedLevel(level)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedLevel === level
                      ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/30 shadow-md scale-102"
                      : "border-gray-200 dark:border-gray-700 hover:border-yellow-300 bg-white dark:bg-gray-800"
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-gray-900 dark:text-white text-base">{title}</span>
                    {selectedLevel === level && (
                      <CheckCircle2 className="h-5 w-5 text-yellow-500" />
                    )}
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300">{desc}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 text-gray-900 font-bold shadow-lg hover:scale-105 transition-all flex items-center space-x-2 disabled:opacity-50"
              >
                <span>{saving ? "Saving..." : "Next: Privacy & Data Retention"}</span>
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 2: Privacy Explanation */}
      {currentStep === 2 && (
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl space-y-6 animate-fade-in">
          <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center space-x-2">
              <ShieldCheck className="h-6 w-6 text-lime-500" />
              <span>Step 2: Privacy & Raw Text Retention Policy</span>
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
              You own your data. Configure how long your captured raw text is stored on the server.
            </p>
          </div>

          <form onSubmit={handleStep2Submit} className="space-y-6">
            <div className="space-y-4">
              <label className="block text-sm font-bold text-gray-900 dark:text-white">
                Raw Text Retention Period:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { days: 0, title: "0 Days (Immediate Purge)", desc: "Raw text is discarded immediately after analysis. Only grammar evidence is saved." },
                  { days: 7, title: "7 Days (Recommended)", desc: "Raw text is automatically purged after 7 days while keeping your progress intact." },
                  { days: 30, title: "30 Days", desc: "Raw text retained for 30 days for extended review before automated deletion." },
                ].map(({ days, title, desc }) => (
                  <div
                    key={days}
                    onClick={() => setRetentionDays(days)}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      retentionDays === days
                        ? "border-lime-500 bg-lime-50 dark:bg-lime-900/30 shadow-md"
                        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-gray-900 dark:text-white text-sm">{title}</span>
                      {retentionDays === days && <CheckCircle2 className="h-5 w-5 text-lime-500" />}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300">{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 space-y-2 text-xs text-gray-600 dark:text-gray-300">
              <div className="font-bold text-gray-900 dark:text-white flex items-center space-x-1.5">
                <Lock className="h-4 w-4 text-blue-500" />
                <span>Your Data Rights Guarantee</span>
              </div>
              <p>• 1-Click JSON Data Export: Download all your vocabulary, grammar evidence, and history anytime.</p>
              <p>• Cascading Permanent Account Deletion: Purge all 11 database tables in a single click.</p>
              <p>• No Third-Party Tracking: First-party telemetry only, zero raw text disclosed to external trackers.</p>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="privacy-consent"
                checked={agreedPrivacy}
                onChange={(e) => setAgreedPrivacy(e.target.checked)}
                className="h-5 w-5 rounded border-gray-300 text-lime-500 focus:ring-lime-400"
              />
              <label htmlFor="privacy-consent" className="text-xs font-medium text-gray-800 dark:text-gray-200">
                I understand and agree to LinguaLearn's privacy and data retention policy.
              </label>
            </div>

            <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium text-sm flex items-center space-x-1"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 text-gray-900 font-bold shadow-lg hover:scale-105 transition-all flex items-center space-x-2 disabled:opacity-50"
              >
                <span>{saving ? "Saving..." : "Next: App Selection"}</span>
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 3: App Selection */}
      {currentStep === 3 && (
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl space-y-6 animate-fade-in">
          <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center space-x-2">
              <Layers className="h-6 w-6 text-blue-500" />
              <span>Step 3: Desktop Application Selection</span>
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
              Specify which applications the Mac agent should monitor or exclude from writing analysis.
            </p>
          </div>

          <form onSubmit={handleStep3Submit} className="space-y-6">
            <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
              <div>
                <span className="font-bold text-sm text-gray-900 dark:text-white">Allow All Desktop Applications</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">Capture writing from any active desktop app automatically.</p>
              </div>
              <button
                type="button"
                onClick={() => setAllowAllApps(!allowAllApps)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  allowAllApps ? "bg-yellow-500" : "bg-gray-300 dark:bg-gray-600"
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${allowAllApps ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>

            {!allowAllApps && (
              <div className="space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Select Allowed Applications:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {DESKTOP_APPS.map(({ id, name, icon }) => {
                    const isSelected = allowedApps.includes(id);
                    return (
                      <div
                        key={id}
                        onClick={() => {
                          if (isSelected) {
                            setAllowedApps(allowedApps.filter((a) => a !== id));
                          } else {
                            setAllowedApps([...allowedApps, id]);
                          }
                        }}
                        className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center space-x-2 ${
                          isSelected
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200"
                            : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        <span className="text-base">{icon}</span>
                        <span className="text-xs font-semibold truncate">{name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="px-4 py-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium text-sm flex items-center space-x-1"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 text-gray-900 font-bold shadow-lg hover:scale-105 transition-all flex items-center space-x-2 disabled:opacity-50"
              >
                <span>{saving ? "Saving..." : "Next: Device Token"}</span>
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 4: Device Token Creation */}
      {currentStep === 4 && (
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl space-y-6 animate-fade-in">
          <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center space-x-2">
              <KeyRound className="h-6 w-6 text-purple-500" />
              <span>Step 4: Create Mac Device Token</span>
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
              Generate a unique revocable Bearer token string to authorize your Mac capture agent.
            </p>
          </div>

          <form onSubmit={handleStep4Submit} className="space-y-6">
            <div>
              <label htmlFor="device-name" className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                Device Name
              </label>
              <div className="flex space-x-3">
                <input
                  id="device-name"
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="e.g. Work MacBook Pro"
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-yellow-400"
                />
                <button
                  type="button"
                  onClick={handleGenerateToken}
                  disabled={creatingToken || !deviceName.trim()}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm shadow-md transition-all flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <KeyRound className="h-4 w-4" />
                  <span>{creatingToken ? "Generating..." : "Generate Token"}</span>
                </button>
              </div>
            </div>

            {createdToken && (
              <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-900 dark:text-purple-200 uppercase tracking-wider">
                    Generated Bearer Secret Token (Display Once):
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(createdToken);
                      setTokenCopied(true);
                      setTimeout(() => setTokenCopied(false), 2000);
                    }}
                    className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-purple-100 text-xs font-bold hover:bg-purple-300"
                  >
                    {tokenCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{tokenCopied ? "Copied!" : "Copy Token"}</span>
                  </button>
                </div>
                <div className="p-3 rounded-lg bg-gray-900 text-yellow-400 font-mono text-xs break-all select-all">
                  {createdToken}
                </div>
                <p className="text-[11px] text-purple-700 dark:text-purple-300">
                  ⚠️ Save this token string now! Only the SHA-256 hash is stored on the server.
                </p>
              </div>
            )}

            <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="px-4 py-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium text-sm flex items-center space-x-1"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 text-gray-900 font-bold shadow-lg hover:scale-105 transition-all flex items-center space-x-2 disabled:opacity-50"
              >
                <span>{saving ? "Saving..." : "Next: Test Sentence"}</span>
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 5: First Test Sentence & Writing Analysis */}
      {currentStep === 5 && (
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl space-y-6 animate-fade-in">
          <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center space-x-2">
              <Sparkles className="h-6 w-6 text-yellow-500" />
              <span>Step 5: Test Your Writing Analysis</span>
            </h2>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
              Submit a sample English sentence to see Gemini AI grammar correction and Russian explanation in action.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="test-sentence" className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                Sample English Sentence
              </label>
              <div className="flex space-x-3">
                <input
                  id="test-sentence"
                  type="text"
                  value={testSentence}
                  onChange={(e) => setTestSentence(e.target.value)}
                  placeholder="Enter an English sentence..."
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-yellow-400"
                />
                <button
                  type="button"
                  onClick={handleRunTestAnalysis}
                  disabled={analyzing || !testSentence.trim()}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-yellow-400 to-lime-400 text-gray-900 font-bold text-sm shadow-md hover:scale-105 transition-all flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4 text-gray-900" />
                  <span>{analyzing ? "Analyzing..." : "Analyze"}</span>
                </button>
              </div>
            </div>

            {analysisResult && (
              <div className="p-5 rounded-2xl bg-yellow-50/50 dark:bg-gray-900/50 border border-yellow-200 dark:border-yellow-900/50 space-y-4 animate-slide-up">
                <div className="flex items-center justify-between border-b border-yellow-200 dark:border-yellow-800/40 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-yellow-800 dark:text-yellow-300">
                    Analysis Result
                  </span>
                  <span className="text-xs text-gray-500">App: OnboardingTest</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40">
                    <span className="text-xs font-bold text-red-700 dark:text-red-300 block mb-1">Original</span>
                    <p className="text-gray-800 dark:text-gray-200">{analysisResult.originalText || testSentence}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-lime-50 dark:bg-lime-900/20 border border-lime-200 dark:border-lime-800/40">
                    <span className="text-xs font-bold text-lime-700 dark:text-lime-300 block mb-1">Corrected</span>
                    <p className="text-gray-900 dark:text-white font-semibold">{analysisResult.correctedText || testSentence}</p>
                  </div>
                </div>

                {analysisResult.summaryRu && (
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 text-xs text-blue-900 dark:text-blue-200">
                    <span className="font-bold block mb-0.5">Russian Explanation:</span>
                    <p>{analysisResult.summaryRu}</p>
                  </div>
                )}

                {Array.isArray(analysisResult.errors) && analysisResult.errors.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {analysisResult.errors.map((err, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 text-xs font-semibold">
                        {err.type || err.topic || "Grammar Error"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setCurrentStep(4)}
                className="px-4 py-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium text-sm flex items-center space-x-1"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={handleFinishOnboarding}
                disabled={saving}
                className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-lime-400 via-yellow-400 to-lime-400 text-gray-900 font-extrabold text-base shadow-xl hover:scale-105 transition-all flex items-center space-x-2 disabled:opacity-50 animate-pulse"
              >
                <span>Finish Onboarding & Go to Today Dashboard</span>
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
