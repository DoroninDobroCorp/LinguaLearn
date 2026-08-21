import React, { useState, useRef, useEffect } from 'react';
import {
  Send, Loader2, Trash2, CheckCircle, XCircle, Sparkles, MessageCircle,
  Target, Volume2, HelpCircle, CheckCircle2, ChevronRight, ArrowLeft, RefreshCw, Award
} from 'lucide-react';
import { profileApiUrl, profileFetch } from '../utils/api';
import { parseExerciseTag } from '../utils/exerciseParser';
import { soundEngine, speakSpanish } from '../utils/soundEffects';
import { useLanguage } from '../contexts/LanguageContext';

// Exercise Widget inside Tutor Chat
function ExerciseWidget({ exercise, onAnswer }) {
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (submitted) return;

    let answer;
    if (exercise.type === 'multiple-choice') {
      answer = selectedOption;
    } else {
      answer = userAnswer.trim();
    }

    if (!answer) return;

    setSubmitted(true);
    const isCorrect = answer.toLowerCase() === exercise.correctAnswer.toLowerCase();
    if (isCorrect) soundEngine.playCorrect();
    else soundEngine.playWrong();
    onAnswer(answer, isCorrect, exercise);
  };

  return (
    <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/40 dark:to-pink-950/40 border-2 border-purple-300 dark:border-purple-700 rounded-xl p-5 my-3 shadow-md">
      <div className="flex items-center space-x-2 mb-3">
        <span className="px-3 py-1 bg-purple-200 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full text-xs font-semibold">
          {exercise.type === 'multiple-choice' ? '📝 Quiz' : exercise.type === 'fill-blank' ? '✍️ Fill in' : '💭 Open Question'}
        </span>
        <span className="px-3 py-1 bg-pink-200 dark:bg-pink-900 text-pink-800 dark:text-pink-200 rounded-full text-xs font-semibold">
          {exercise.level}
        </span>
      </div>

      <p className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-4">{exercise.question}</p>

      {exercise.type === 'multiple-choice' && (
        <div className="space-y-2 mb-4">
          {exercise.options.map((option, idx) => (
            <button
              key={idx}
              onClick={() => !submitted && setSelectedOption(option)}
              disabled={submitted}
              className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                submitted
                  ? option.toLowerCase() === exercise.correctAnswer.toLowerCase()
                    ? 'bg-green-200 border-2 border-green-500 text-green-900'
                    : option === selectedOption
                    ? 'bg-red-200 border-2 border-red-500 text-red-900'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                  : selectedOption === option
                  ? 'bg-purple-200 border-2 border-purple-500 text-purple-900'
                  : 'bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 hover:border-purple-400 text-gray-800 dark:text-gray-200'
              }`}
            >
              <span className="font-semibold mr-2">{String.fromCharCode(65 + idx)}.</span>
              {option}
              {submitted && option.toLowerCase() === exercise.correctAnswer.toLowerCase() && (
                <CheckCircle className="inline ml-2 h-5 w-5 text-green-600" />
              )}
              {submitted && option === selectedOption && option.toLowerCase() !== exercise.correctAnswer.toLowerCase() && (
                <XCircle className="inline ml-2 h-5 w-5 text-red-600" />
              )}
            </button>
          ))}
        </div>
      )}

      {exercise.type !== 'multiple-choice' && (
        <div className="mb-4">
          <input
            type="text"
            value={userAnswer}
            onChange={(e) => setUserAnswer(e.target.value)}
            disabled={submitted}
            placeholder="Type your answer in Spanish..."
            className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 dark:bg-gray-800 rounded-lg focus:border-purple-500 focus:outline-none text-gray-800 dark:text-white"
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>
      )}

      {!submitted ? (
        <button
          onClick={handleSubmit}
          disabled={exercise.type === 'multiple-choice' ? !selectedOption : !userAnswer.trim()}
          className="w-full py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50"
        >
          Check Answer
        </button>
      ) : (
        <div className={`p-3 rounded-lg flex items-center space-x-2 ${
          (exercise.type === 'multiple-choice' ? selectedOption : userAnswer).toLowerCase() === exercise.correctAnswer.toLowerCase()
            ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200'
            : 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200'
        }`}>
          {(exercise.type === 'multiple-choice' ? selectedOption : userAnswer).toLowerCase() === exercise.correctAnswer.toLowerCase() ? (
            <>
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              <span className="font-medium">¡Excelente! Correct answer.</span>
            </>
          ) : (
            <>
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              <div>
                <p className="font-medium">Incorrect.</p>
                <p className="text-sm">Correct answer: <span className="font-bold">{exercise.correctAnswer}</span></p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Chat() {
  const { t, language } = useLanguage();
  const [activeMode, setActiveMode] = useState('tutor'); // 'tutor' (default) | 'roleplay'

  // --- FREE TUTOR STATE (WITH LIVE TOPIC ERROR TRACKING) ---
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState([]);
  const messagesEndRef = useRef(null);

  // --- SCENARIO ROLEPLAY STATE ---
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [scenarioMessages, setScenarioMessages] = useState([]);
  const [scenarioInput, setScenarioInput] = useState('');
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [completedGoals, setCompletedGoals] = useState([]);
  const [feedbackHistory, setFeedbackHistory] = useState([]);
  const [activeHints, setActiveHints] = useState([]);
  const [isScenarioFinished, setIsScenarioFinished] = useState(false);
  const scenarioEndRef = useRef(null);

  const showToast = (message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(tItem => tItem.id !== id));
    }, 4500);
  };

  // Load chat history and scenarios
  const fetchTutorHistory = async () => {
    try {
      const res = await profileFetch(profileApiUrl('/spanish/api/chat/history'));
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setMessages(data.map(m => {
            const parsed = parseExerciseTag(m.content);
            return {
              role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user',
              content: parsed ? parsed.cleanContent : m.content,
              exercise: parsed ? parsed.exercise : null
            };
          }));
        } else {
          setMessages([{
            role: 'assistant',
            content: '¡Hola! I am your AI Spanish tutor. Lets practice speaking, grammar, or ask me any question!'
          }]);
        }
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    }
  };

  const fetchScenarios = async () => {
    try {
      const res = await profileFetch(profileApiUrl('/spanish/api/scenarios'));
      if (res.ok) {
        const data = await res.json();
        setScenarios(data.scenarios || []);
      }
    } catch (error) {
      console.error('Error loading scenarios:', error);
    }
  };

  useEffect(() => {
    fetchTutorHistory();
    fetchScenarios();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    scenarioEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [scenarioMessages]);

  // Handle Free Tutor Send WITH TOPIC ERROR TRACKING
  const handleTutorSend = async (messageText = null) => {
    const textToSend = typeof messageText === 'string' ? messageText : inputMessage.trim();
    if (!textToSend || loading) return;

    setInputMessage('');
    setMessages(prev => [...prev, { role: 'user', content: textToSend }]);
    setLoading(true);

    try {
      const res = await profileFetch(profileApiUrl('/spanish/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: textToSend })
      });

      if (res.ok) {
        const data = await res.json();

        // 1. Process Live Topic Score Changes / Error Tracking Toasts!
        if (data.topicChanges && data.topicChanges.length > 0) {
          data.topicChanges.forEach(change => {
            if (change.isNew) {
              showToast(`🆕 ${change.name} (${change.level})`, 'new');
            } else if (change.success) {
              soundEngine.playCorrect();
              showToast(`✅ ${change.name} +${change.scoreChange} (${change.newScore}/100)`, 'success');
            } else {
              soundEngine.playWrong();
              showToast(`❌ ${change.name} ${change.scoreChange} (${change.newScore}/100)`, 'error');
            }
          });
        }

        // 2. Parse exercise if returned
        let exercise = data.exercise || null;
        let cleanResponse = data.reply || data.response || '';

        if (!exercise && cleanResponse) {
          const parsed = parseExerciseTag(cleanResponse);
          if (parsed) {
            exercise = parsed.exercise;
            cleanResponse = parsed.cleanContent;
          }
        }

        setMessages(prev => [...prev, {
          role: 'assistant',
          content: cleanResponse,
          exercise: exercise
        }]);
      }
    } catch (err) {
      console.error('Error sending message:', err);
      showToast('⚠️ Error sending message. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleExerciseAnswer = (answer, isCorrect, exercise) => {
    const feedback = `My answer: ${answer}`;
    handleTutorSend(feedback);
  };

  const handleClearTutorChat = async () => {
    if (!window.confirm('¿Borrar todo el historial de conversación? / Clear chat history?')) return;
    try {
      await profileFetch(profileApiUrl('/spanish/api/chat/clear'), { method: 'DELETE' });
      setMessages([{
        role: 'assistant',
        content: '¡Chat borrado! Lets start fresh. What would you like to practice?'
      }]);
      showToast('Chat history cleared', 'new');
    } catch (err) {
      console.error('Error clearing chat:', err);
    }
  };

  // Handle Scenario Selection
  const startScenario = (sc) => {
    setSelectedScenario(sc);
    setScenarioMessages([
      { role: 'model', content: sc.initialMessage }
    ]);
    setCompletedGoals(sc.progress?.completedGoals || []);
    setActiveHints(sc.suggestedHints ? sc.suggestedHints.slice(0, 2) : []);
    setFeedbackHistory([]);
    setIsScenarioFinished(Boolean(sc.progress?.isCompleted));
  };

  // Handle Scenario Chat Send
  const handleScenarioSend = async (customText = null) => {
    const textToSend = typeof customText === 'string' ? customText : scenarioInput.trim();
    if (!textToSend || scenarioLoading || !selectedScenario) return;

    setScenarioInput('');
    soundEngine.playTileClick();
    setScenarioMessages(prev => [...prev, { role: 'user', content: textToSend }]);
    setScenarioLoading(true);

    try {
      const res = await profileFetch(profileApiUrl(`/spanish/api/scenarios/${selectedScenario.id}/chat`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history: scenarioMessages,
          completedGoalIds: completedGoals
        })
      });

      if (res.ok) {
        const data = await res.json();
        setScenarioMessages(prev => [...prev, { role: 'model', content: data.reply }]);

        if (Array.isArray(data.completedGoalIds)) {
          setCompletedGoals(data.completedGoalIds);
        }

        if (data.newlyCompletedGoals && data.newlyCompletedGoals.length > 0) {
          soundEngine.playCombo(data.newlyCompletedGoals.length + 1);
        }

        if (data.isCompleted && !isScenarioFinished) {
          setIsScenarioFinished(true);
          soundEngine.playLevelUp();
        }

        if (data.feedback) {
          setFeedbackHistory(prev => [data.feedback, ...prev]);
        }

        if (Array.isArray(data.hints)) {
          setActiveHints(data.hints);
        }

        fetchScenarios();
      }
    } catch (err) {
      console.error('Error in scenario chat:', err);
    } finally {
      setScenarioLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 relative">
      {/* Toast notifications for Topic Error / Score tracking */}
      <div className="fixed top-20 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-2xl shadow-xl animate-fadeIn flex items-center space-x-2 min-w-[280px] pointer-events-auto border ${
              toast.type === 'new'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white border-blue-400'
                : toast.type === 'success'
                ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white border-green-400'
                : 'bg-gradient-to-r from-rose-600 to-red-600 text-white border-red-400'
            }`}
          >
            <span className="font-extrabold text-sm">{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Mode Switcher Banner */}
      <div className="flex items-center justify-between mb-6 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md p-2 rounded-2xl border border-purple-100 dark:border-gray-700 shadow-sm">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveMode('tutor')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
              activeMode === 'tutor'
                ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-md'
                : 'text-gray-600 dark:text-gray-400 hover:bg-purple-50 dark:hover:bg-gray-700'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            <span>🤖 {t('quests_tab_tutor', 'AI-репетитор (Отслеживание тем & ошибок)')}</span>
          </button>

          <button
            onClick={() => setActiveMode('roleplay')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
              activeMode === 'roleplay'
                ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-md'
                : 'text-gray-600 dark:text-gray-400 hover:bg-purple-50 dark:hover:bg-gray-700'
            }`}
          >
            <Target className="w-4 h-4" />
            <span>🎭 {t('quests_tab_roleplay', 'Сюжетные квесты & Ролеплей')}</span>
          </button>
        </div>

        {activeMode === 'tutor' && messages.length > 0 && (
          <button
            onClick={handleClearTutorChat}
            className="flex items-center space-x-1 text-xs text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Очистить</span>
          </button>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* 1. FREE AI TUTOR CHAT (WITH LIVE TOPIC TRACKING)    */}
      {/* ---------------------------------------------------- */}
      {activeMode === 'tutor' && (
        <div className="flex flex-col h-[700px] glass-card rounded-3xl border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 shadow-2xl overflow-hidden animate-fadeIn">
          {/* Header */}
          <div className="p-4 border-b border-purple-100 dark:border-gray-700 flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50 dark:from-gray-800 dark:to-gray-750">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-600 flex items-center justify-center text-white font-bold shadow">
                AI
              </div>
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-white text-sm">
                  AI-репетитор испанского языка
                </h3>
                <p className="text-xs text-green-600 dark:text-green-400 font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Анализирует грамматику и в реальном времени обновляет прогресс тем (+5% / -10%)
                </p>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl p-4 shadow-sm relative group ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white rounded-br-none'
                      : 'bg-purple-50/90 dark:bg-gray-700/90 text-gray-900 dark:text-white border border-purple-100 dark:border-gray-600 rounded-bl-none'
                  }`}
                >
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</div>

                  {msg.role !== 'user' && (
                    <button
                      onClick={() => speakSpanish(msg.content)}
                      className="absolute -right-8 top-2 p-1 text-gray-400 hover:text-purple-600"
                      title="Прослушать"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Interactive Exercise Widget if present */}
                {msg.exercise && (
                  <div className="max-w-[80%] w-full mt-2">
                    <ExerciseWidget
                      exercise={msg.exercise}
                      onAnswer={handleExerciseAnswer}
                    />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-purple-50 dark:bg-gray-700 rounded-2xl p-4 rounded-bl-none flex items-center space-x-2">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                  <span className="text-xs text-gray-500">Репетитор анализирует и пишет ответ...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Chat input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleTutorSend();
            }}
            className="p-4 bg-white dark:bg-gray-800 border-t border-purple-100 dark:border-gray-700 flex items-center space-x-2"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Напиши сообщение на испанском или задай вопрос по грамматике..."
              disabled={loading}
              className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-purple-200 dark:border-gray-600 rounded-xl focus:border-purple-500 focus:outline-none text-sm text-gray-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || loading}
              className="p-3 bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white rounded-xl shadow-md transition-transform active:scale-95 disabled:opacity-50"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* 2. SCENARIO ROLEPLAY VIEW                            */}
      {/* ---------------------------------------------------- */}
      {activeMode === 'roleplay' && (
        <>
          {!selectedScenario ? (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-fuchsia-500" />
                  {t('quests_title', 'Сценарные ролевые квесты с AI')}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {t('quests_sub', 'Практикуй реальный испанский в жизненных ситуациях с живыми персонажами.')}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {scenarios.map((sc) => {
                  const completedGoalsCount = sc.progress?.completedGoals?.length || 0;
                  const totalGoals = sc.objectives.length;
                  const isDone = sc.progress?.isCompleted || completedGoalsCount >= totalGoals;

                  return (
                    <div
                      key={sc.id}
                      className="glass-card rounded-3xl p-6 shadow-xl border border-purple-100 dark:border-gray-700 flex flex-col justify-between hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 bg-white/85 dark:bg-gray-800/85 group"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-950/40 dark:to-orange-950/40 flex items-center justify-center text-3xl shadow-inner group-hover:scale-110 transition-transform">
                            {sc.avatarEmoji}
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                              {sc.level}
                            </span>
                            {isDone && (
                              <span className="flex items-center space-x-1 text-xs font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/60 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{t('quests_completed_badge', 'Пройдено')}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <h3 className="text-lg font-extrabold text-gray-900 dark:text-white mb-1">
                          {sc.title}
                        </h3>
                        <div className="text-xs text-purple-600 dark:text-purple-400 font-semibold mb-2">
                          👤 {sc.characterName} ({sc.characterRole})
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 mb-4">
                          {sc.context}
                        </p>

                        <div className="space-y-1.5 mb-6">
                          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                            {t('quests_objectives', 'Цели миссии')} ({completedGoalsCount}/{totalGoals}):
                          </div>
                          {sc.objectives.map((obj) => {
                            const isObjDone = sc.progress?.completedGoals?.includes(obj.id);
                            return (
                              <div
                                key={obj.id}
                                className={`text-xs flex items-center space-x-1.5 ${
                                  isObjDone ? 'text-green-600 dark:text-green-400 font-bold' : 'text-gray-500'
                                }`}
                              >
                                <span>{isObjDone ? '✓' : '○'}</span>
                                <span className="line-clamp-1">{obj.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <button
                        onClick={() => startScenario(sc)}
                        className="w-full py-3 bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-bold rounded-2xl shadow-lg transition-transform active:scale-95 flex items-center justify-center space-x-2 text-sm"
                      >
                        <Target className="w-4 h-4" />
                        <span>{isDone ? 'Rejugar Misión' : 'Iniciar Misión'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
              <div className="space-y-4">
                <button
                  onClick={() => setSelectedScenario(null)}
                  className="flex items-center space-x-2 text-purple-600 dark:text-purple-400 hover:text-purple-800 font-bold text-sm mb-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Выбрать другой квест</span>
                </button>

                <div className="glass-card rounded-3xl p-5 border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 shadow-lg">
                  <div className="flex items-center space-x-4 mb-3">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-3xl shadow-md">
                      {selectedScenario.avatarEmoji}
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
                        {selectedScenario.characterName}
                      </h3>
                      <p className="text-xs text-purple-600 dark:text-purple-400 font-semibold">
                        {selectedScenario.characterRole}
                      </p>
                      <span className="inline-block mt-1 text-[10px] bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2 py-0.5 rounded-full font-bold">
                        📍 {selectedScenario.dialect}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 border-t border-purple-50 dark:border-gray-700 pt-3">
                    {selectedScenario.context}
                  </p>
                </div>

                <div className="glass-card rounded-3xl p-5 border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 shadow-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                      <Target className="w-4 h-4 text-fuchsia-500" />
                      Цели ({completedGoals.length}/{selectedScenario.objectives.length})
                    </h4>
                    {isScenarioFinished && (
                      <span className="text-[10px] bg-green-500 text-white font-bold px-2 py-0.5 rounded-full">
                        Пройдено! 🎉
                      </span>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {selectedScenario.objectives.map((obj) => {
                      const isDone = completedGoals.includes(obj.id);
                      return (
                        <div
                          key={obj.id}
                          className={`p-2.5 rounded-xl border transition-all flex items-start space-x-2.5 ${
                            isDone
                              ? 'bg-green-50/80 dark:bg-green-950/40 border-green-300 dark:border-green-800 text-green-900 dark:text-green-200'
                              : 'bg-gray-50 dark:bg-gray-700/40 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          <div className="mt-0.5">
                            {isDone ? (
                              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                            ) : (
                              <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-500" />
                            )}
                          </div>
                          <div>
                            <div className="text-xs font-bold">{obj.label}</div>
                            <div className="text-[11px] opacity-75">{obj.description}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {feedbackHistory.length > 0 && (
                  <div className="glass-card rounded-3xl p-5 border border-purple-100 dark:border-gray-700 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 shadow-lg">
                    <h4 className="font-bold text-xs text-purple-900 dark:text-purple-200 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      Советы и подсказки:
                    </h4>
                    {feedbackHistory[0].correction && (
                      <div className="text-xs text-gray-800 dark:text-gray-200 mb-2 p-2 rounded-lg bg-white/70 dark:bg-gray-800/70 border border-purple-200">
                        ✍️ <span className="font-semibold">{feedbackHistory[0].correction}</span>
                      </div>
                    )}
                    {feedbackHistory[0].culturalTip && (
                      <div className="text-xs text-purple-800 dark:text-purple-300 italic">
                        🧉 {feedbackHistory[0].culturalTip}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="lg:col-span-2 flex flex-col h-[650px] glass-card rounded-3xl border border-purple-100 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 shadow-2xl overflow-hidden">
                <div className="flex-1 p-6 overflow-y-auto space-y-4">
                  {scenarioMessages.map((msg, index) => (
                    <div
                      key={index}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl p-4 shadow-sm relative group ${
                          msg.role === 'user'
                            ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white rounded-br-none'
                            : 'bg-purple-50/90 dark:bg-gray-700/90 text-gray-900 dark:text-white border border-purple-100 dark:border-gray-600 rounded-bl-none'
                        }`}
                      >
                        <div className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </div>

                        {msg.role !== 'user' && (
                          <button
                            onClick={() => speakSpanish(msg.content, selectedScenario.dialect)}
                            className="absolute -right-9 top-2 p-1.5 text-gray-400 hover:text-purple-600 rounded-full hover:bg-purple-100 dark:hover:bg-gray-700 transition-colors opacity-80"
                            title="Escuchar"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {scenarioLoading && (
                    <div className="flex justify-start">
                      <div className="bg-purple-50 dark:bg-gray-700 rounded-2xl p-4 rounded-bl-none flex items-center space-x-2">
                        <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                        <span className="text-xs text-gray-500">{selectedScenario.characterName} печатает...</span>
                      </div>
                    </div>
                  )}

                  <div ref={scenarioEndRef} />
                </div>

                {activeHints && activeHints.length > 0 && !isScenarioFinished && (
                  <div className="px-4 py-2 bg-purple-50/50 dark:bg-gray-750/50 border-t border-purple-100 dark:border-gray-700 flex flex-wrap gap-2 items-center">
                    <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Подсказки:
                    </span>
                    {activeHints.map((hint, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleScenarioSend(hint.replace(/[«»]/g, ''))}
                        className="px-3 py-1 bg-white dark:bg-gray-700 text-purple-900 dark:text-purple-200 text-xs font-semibold rounded-full border border-purple-200 dark:border-gray-600 hover:bg-purple-100 dark:hover:bg-gray-600 transition-colors shadow-sm"
                      >
                        {hint}
                      </button>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleScenarioSend();
                  }}
                  className="p-4 bg-white dark:bg-gray-800 border-t border-purple-100 dark:border-gray-700 flex items-center space-x-2"
                >
                  <input
                    type="text"
                    value={scenarioInput}
                    onChange={(e) => setScenarioInput(e.target.value)}
                    placeholder={`Напиши ${selectedScenario.characterName} на испанском...`}
                    disabled={scenarioLoading}
                    className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-purple-200 dark:border-gray-600 rounded-xl focus:border-purple-500 focus:outline-none text-sm text-gray-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={!scenarioInput.trim() || scenarioLoading}
                    className="p-3 bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white rounded-xl shadow-md transition-transform active:scale-95 disabled:opacity-50"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
