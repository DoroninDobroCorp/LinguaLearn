import React, { useState, useEffect, useRef } from 'react';
import { 
  X, BookOpen, Bot, Sparkles, Send, Volume2, CheckCircle2, 
  AlertTriangle, Lightbulb, ChevronRight, Loader2, ArrowRight,
  RotateCcw, Copy, Check, Target, Zap
} from 'lucide-react';

import { useTheme } from '../contexts/ThemeContext';
import { speakEnglish, soundEngine } from '../utils/soundEffects';

// Simple markdown formatter helper for AI chat messages
function FormattedMessage({ content }) {
  if (!content) return null;

  const lines = content.split('\n');
  return (
    <div className="space-y-1.5 leading-relaxed text-sm">
      {lines.map((line, lIdx) => {
        if (!line.trim()) {
          return <div key={lIdx} className="h-1.5" />;
        }

        // Bullet line
        const isBullet = line.trim().startsWith('* ') || line.trim().startsWith('- ') || line.trim().startsWith('• ');
        const cleanLine = isBullet ? line.trim().replace(/^[*•\-]\s*/, '') : line;

        // Split line by bold tokens (**bold**)
        const parts = cleanLine.split(/(\*\*.*?\*\*)/g);

        return (
          <div key={lIdx} className={isBullet ? 'flex items-start space-x-2 ml-1' : ''}>
            {isBullet && <span className="text-purple-400 mt-1 text-xs">•</span>}
            <p className="flex-1">
              {parts.map((part, pIdx) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                  return (
                    <strong key={pIdx} className="font-bold text-fuchsia-300">
                      {part.slice(2, -2)}
                    </strong>
                  );
                }
                if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
                  return (
                    <em key={pIdx} className="italic text-sky-300">
                      {part.slice(1, -1)}
                    </em>
                  );
                }
                return part;
              })}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function TopicTheoryModal({ topicId, topicName, isOpen, onClose, onStartPractice }) {
  const { isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('theory'); // theory | tutor
  const [theoryData, setTheoryData] = useState(null);
  const [loadingTheory, setLoadingTheory] = useState(true);

  // AI Tutor State
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const chatBottomRef = useRef(null);

  // Practice & Quiz State
  const [practiceExercise, setPracticeExercise] = useState(null);
  const [loadingPractice, setLoadingPractice] = useState(false);
  const [selectedPracticeOption, setSelectedPracticeOption] = useState('');
  const [practiceAnswer, setPracticeAnswer] = useState('');
  const [showPracticeResult, setShowPracticeResult] = useState(false);
  const [isPracticeCorrect, setIsPracticeCorrect] = useState(false);

  const fetchPracticeExercise = async () => {
    setLoadingPractice(true);
    setShowPracticeResult(false);
    setSelectedPracticeOption('');
    setPracticeAnswer('');
    try {
      const res = await fetch('/english/api/exercises/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId })
      });
      if (res.ok) {
        const data = await res.json();
        const ex = (data.exercises && data.exercises[0]) || data.exercise;
        setPracticeExercise(ex);
      }
    } catch (err) {
      console.error('Error fetching practice exercise:', err);
    } finally {
      setLoadingPractice(false);
    }
  };

  useEffect(() => {
    if (isOpen && topicId) {
      fetchTheory();
    }
  }, [isOpen, topicId]);

  useEffect(() => {
    if (activeTab === 'tutor' && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const fetchTheory = async () => {
    setLoadingTheory(true);
    try {
      const res = await fetch(`/english/api/curriculum/topics/${topicId}/theory`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTheoryData(data.theory);
        // Initial tutor welcome message
        setMessages([
          {
            role: 'model',
            content: `Hello! Я твой личный AI-репетитор по теме **«${data.topic?.name || topicName}»** (${data.topic?.level || 'A1'}).\n\nЗадай любой вопрос по правилу, попроси разобрать примеры или дать персональные упражнения!`
          }
        ]);
      }
    } catch (err) {
      console.error('Error fetching theory:', err);
    } finally {
      setLoadingTheory(false);
    }
  };

  const handleSpeak = (text) => {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  };

  const sendMessage = async (textToSend) => {
    const msg = (textToSend || inputText).trim();
    if (!msg || sendingMessage) return;

    setInputText('');
    const newMessages = [...messages, { role: 'user', content: msg }];
    setMessages(newMessages);
    setSendingMessage(true);

    try {
      const res = await fetch(`/english/api/curriculum/topics/${topicId}/tutor-chat`, { credentials: 'include' }, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          chatHistory: newMessages
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages([...newMessages, { role: 'model', content: data.reply }]);
      } else {
        setMessages([...newMessages, { role: 'model', content: 'Не удалось получить ответ от AI-репетитора. Попробуйте еще раз.' }]);
      }
    } catch (err) {
      console.error('Error sending tutor message:', err);
      setMessages([...newMessages, { role: 'model', content: 'Ошибка связи с сервером. Попробуйте снова через несколько секунд.' }]);
    } finally {
      setSendingMessage(false);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        role: 'model',
        content: `Диалог очищен! Чем еще могу помочь по теме **«${theoryData?.russianTitle || topicName}»**?`
      }
    ]);
  };

  if (!isOpen) return null;

  const bgModal = isDark ? 'bg-slate-900 text-gray-100' : 'bg-white text-gray-800';
  const cardBg = isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-slate-50 border-slate-200';
  const subText = isDark ? 'text-gray-400' : 'text-gray-600';
  const borderCol = isDark ? 'border-slate-700' : 'border-gray-200';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-md animate-fade-in overflow-hidden">
      <div className={`relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl border ${borderCol} ${bgModal}`}>
        
        {/* Modal Header */}
        <div className={`flex items-center justify-between p-4 sm:p-5 border-b ${borderCol} flex-shrink-0`}>
          <div className="flex items-center space-x-3">
            <span className="text-2xl">{theoryData?.icon || '📖'}</span>
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30">
                  {theoryData?.level || 'A1'}
                </span>
                <span className="text-xs font-semibold text-purple-400">
                  {theoryData?.category || 'Grammar'}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight mt-0.5">
                {theoryData?.russianTitle || topicName}
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-slate-700/60 transition-all"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className={`flex items-center justify-between border-b ${borderCol} px-4 sm:px-6 bg-slate-800/30 flex-shrink-0 flex-wrap gap-2`}>
          <div className="flex flex-wrap">
            <button
              onClick={() => setActiveTab('theory')}
              className={`flex items-center space-x-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all ${
                activeTab === 'theory'
                  ? 'border-fuchsia-500 text-fuchsia-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              <BookOpen className="h-4 w-4" />
              <span>1. Теория и Правила</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('practice');
                if (!practiceExercise) fetchPracticeExercise();
              }}
              className={`flex items-center space-x-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all ${
                activeTab === 'practice'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              <Target className="h-4 w-4" />
              <span>2. Практика и Квиз</span>
            </button>

            <button
              onClick={() => setActiveTab('tutor')}
              className={`flex items-center space-x-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all ${
                activeTab === 'tutor'
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              <Bot className="h-4 w-4" />
              <span>3. AI-Репетитор</span>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
              </span>
            </button>
          </div>

          {activeTab === 'tutor' && messages.length > 2 && (
            <button
              onClick={clearChat}
              className="text-xs text-gray-400 hover:text-gray-200 flex items-center space-x-1 py-1 px-2 rounded-lg hover:bg-slate-700/40 transition-all"
              title="Очистить переписку"
            >
              <RotateCcw className="h-3 w-3" />
              <span className="hidden sm:inline">Очистить</span>
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {loadingTheory ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <Loader2 className="h-8 w-8 text-fuchsia-500 animate-spin" />
              <p className="text-sm text-gray-400 font-medium">Загрузка правил и материалов...</p>
            </div>
          ) : activeTab === 'theory' ? (
            <div className="space-y-6 animate-fade-in">
              
              {/* Summary Banner */}
              {(theoryData?.summaryRu || theoryData?.summary) && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-fuchsia-500/10 via-purple-500/10 to-transparent border border-fuchsia-500/30">
                  <div className="flex items-start space-x-3">
                    <Lightbulb className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm sm:text-base leading-relaxed font-medium">
                      {theoryData.summaryRu || theoryData.summary}
                    </p>
                  </div>
                </div>
              )}

              {/* Visual SVG Diagram */}
              {theoryData?.visualSvg && (
                <div className="rounded-xl overflow-hidden border border-slate-700/60 shadow-lg bg-slate-950 p-2 sm:p-4">
                  <div 
                    className="w-full flex justify-center" 
                    dangerouslySetInnerHTML={{ __html: theoryData.visualSvg }} 
                  />
                </div>
              )}

              {/* Root Tables if any */}
              {theoryData?.tables?.length > 0 && (
                <div className={`p-4 sm:p-5 rounded-xl border ${cardBg} space-y-3`}>
                  {theoryData.tables.map((table, tIdx) => (
                    <div key={tIdx} className="space-y-2">
                      {table.title && (
                        <h4 className="text-sm font-bold text-sky-400">📊 {table.title}</h4>
                      )}
                      <div className="overflow-x-auto rounded-lg border border-slate-700/60">
                        <table className="w-full text-left text-xs sm:text-sm">
                          <thead className="bg-slate-800 text-gray-200 uppercase font-semibold">
                            <tr>
                              {table.headers?.map((h, hIdx) => (
                                <th key={hIdx} className="px-3 sm:px-4 py-2.5">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-700/60 bg-slate-900/50">
                            {table.rows?.map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-slate-800/40">
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className={`px-3 sm:px-4 py-2.5 font-medium ${cIdx === 0 ? 'text-sky-300 font-bold' : ''}`}>
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Detailed Sections */}
              {theoryData?.sections?.map((sec, idx) => (
                <div key={idx} className={`p-4 sm:p-5 rounded-xl border ${cardBg} space-y-4`}>
                  <h3 className="text-base sm:text-lg font-bold text-fuchsia-400 flex items-center space-x-2">
                    <span>{sec.title}</span>
                  </h3>
                  
                  <div className={`text-sm sm:text-base leading-relaxed whitespace-pre-line ${subText}`}>
                    {sec.content}
                  </div>

                  {/* Section Tables if any */}
                  {sec.tables?.map((table, tIdx) => (
                    <div key={tIdx} className="overflow-x-auto rounded-lg border border-slate-700/60 mt-3">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead className="bg-slate-800 text-gray-200 uppercase font-semibold">
                          <tr>
                            {table.headers.map((h, hIdx) => (
                              <th key={hIdx} className="px-3 sm:px-4 py-2.5">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/60 bg-slate-900/50">
                          {table.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-800/40">
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className={`px-3 sm:px-4 py-2.5 font-medium ${cIdx === 1 ? 'text-fuchsia-400 font-bold' : ''}`}>
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}

                  {/* Key Takeaway */}
                  {sec.keyTakeaway && (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start space-x-2.5 text-xs sm:text-sm text-amber-300">
                      <CheckCircle2 className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                      <span>{sec.keyTakeaway}</span>
                    </div>
                  )}

                  {/* Dialect Notes */}
                  {sec.dialectNotes && (
                    <div className="p-3 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-start space-x-2.5 text-xs sm:text-sm text-sky-300">
                      <Sparkles className="h-4 w-4 text-sky-400 mt-0.5 flex-shrink-0" />
                      <span>{sec.dialectNotes}</span>
                    </div>
                  )}
                </div>
              ))}

              {/* Examples with TTS Audio */}
              {theoryData?.examples?.length > 0 && (
                <div className={`p-4 sm:p-5 rounded-xl border ${cardBg} space-y-3`}>
                  <h3 className="text-base sm:text-lg font-bold text-emerald-400 flex items-center space-x-2">
                    <Sparkles className="h-5 w-5 text-emerald-400" />
                    <span>Примеры предложений с озвучкой</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {theoryData.examples.map((ex, idx) => {
                      const textToPronounce = ex.en || ex.es || ex.text || '';
                      return (
                        <div key={idx} className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-700/60 flex items-start justify-between space-x-2 hover:border-sky-500/30 transition-all">
                          <div className="space-y-1">
                            <p className="font-bold text-sm text-sky-300 leading-snug">{textToPronounce}</p>
                            <p className="text-xs text-gray-300">{ex.ru || ex.translation}</p>
                            {ex.note && <p className="text-[11px] text-fuchsia-400 italic">💡 {ex.note}</p>}
                          </div>
                          {textToPronounce && (
                            <button
                              type="button"
                              onClick={() => handleSpeak(textToPronounce)}
                              className="p-1.5 rounded-lg bg-slate-800 text-gray-300 hover:text-white hover:bg-sky-600 transition-all flex-shrink-0"
                              title="Озвучить на английском"
                            >
                              <Volume2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Common Mistakes */}
              {theoryData?.commonMistakes?.length > 0 && (
                <div className={`p-4 sm:p-5 rounded-xl border border-rose-500/30 bg-rose-950/20 space-y-3`}>
                  <h3 className="text-base sm:text-lg font-bold text-rose-400 flex items-center space-x-2">
                    <AlertTriangle className="h-5 w-5 text-rose-500" />
                    <span>Типичные ошибки студентов</span>
                  </h3>
                  <div className="space-y-2.5">
                    {theoryData.commonMistakes.map((m, idx) => {
                      if (typeof m === 'string') {
                        return (
                          <div key={idx} className="p-3 rounded-lg bg-slate-900/70 border border-rose-500/20 text-xs sm:text-sm text-gray-200 leading-relaxed font-medium">
                            {m}
                          </div>
                        );
                      }
                      return (
                        <div key={idx} className="p-3 rounded-lg bg-slate-900/70 border border-rose-500/20 text-xs sm:text-sm space-y-1">
                          {m.wrong && <p className="text-rose-400 line-through font-medium">❌ {m.wrong}</p>}
                          {m.right && <p className="text-emerald-400 font-bold">✅ {m.right}</p>}
                          {m.explanation && <p className="text-gray-300 text-xs">{m.explanation}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          ) : activeTab === 'practice' ? (
            /* INTERACTIVE PRACTICE & QUIZ TAB */
            <div className="space-y-6 animate-fade-in">
              {loadingPractice ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
                  <p className="text-sm text-gray-400 font-medium">Генерация практического задания по теме...</p>
                </div>
              ) : practiceExercise ? (
                <div className="p-5 sm:p-6 rounded-2xl bg-slate-900/60 border border-slate-700/80 space-y-6">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                      Практика по теме: {theoryData?.russianTitle || topicName}
                    </span>
                    <button
                      type="button"
                      onClick={() => speakEnglish(practiceExercise.question)}
                      className="p-1.5 rounded-lg bg-slate-800 text-gray-300 hover:text-white hover:bg-indigo-600 transition-all"
                      title="Озвучить"
                    >
                      <Volume2 className="h-4 w-4" />
                    </button>
                  </div>

                  <p className="text-lg sm:text-xl font-bold text-gray-100 leading-relaxed whitespace-pre-line">
                    {practiceExercise.question}
                  </p>

                  {/* Multiple Choice or Text Input */}
                  {practiceExercise.type === 'multiple-choice' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {practiceExercise.options?.map((opt, idx) => {
                        const isSelected = selectedPracticeOption === opt;
                        let btnStyle = 'bg-slate-800/80 border-slate-700 text-gray-200 hover:border-indigo-500';
                        if (showPracticeResult) {
                          if (opt === practiceExercise.correctAnswer) {
                            btnStyle = 'bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold';
                          } else if (isSelected) {
                            btnStyle = 'bg-rose-950/60 border-rose-500 text-rose-300';
                          } else {
                            btnStyle = 'opacity-40 border-slate-800';
                          }
                        } else if (isSelected) {
                          btnStyle = 'bg-indigo-900/40 border-indigo-500 text-indigo-200 font-bold';
                        }

                        return (
                          <button
                            key={idx}
                            onClick={() => !showPracticeResult && setSelectedPracticeOption(opt)}
                            disabled={showPracticeResult}
                            className={`p-3.5 rounded-xl border-2 text-left font-medium text-sm transition-all ${btnStyle}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={practiceAnswer}
                      onChange={(e) => setPracticeAnswer(e.target.value)}
                      placeholder="Введите ответ на английском..."
                      disabled={showPracticeResult}
                      className="w-full px-4 py-3 rounded-xl bg-slate-800 border-2 border-slate-700 focus:border-indigo-500 text-white font-semibold text-base outline-none"
                    />
                  )}

                  {/* Result & Explanation */}
                  {showPracticeResult && (
                    <div className={`p-4 rounded-xl border space-y-1.5 animate-fade-in ${
                      isPracticeCorrect ? 'bg-emerald-950/30 border-emerald-500/40' : 'bg-rose-950/30 border-rose-500/40'
                    }`}>
                      <p className={`font-bold text-sm ${isPracticeCorrect ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPracticeCorrect ? '✅ Верно! Отличный результат' : `❌ Правильный ответ: ${practiceExercise.correctAnswer}`}
                      </p>
                      {practiceExercise.explanation && (
                        <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">
                          💡 {practiceExercise.explanation}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex justify-end pt-2">
                    {!showPracticeResult ? (
                      <button
                        onClick={() => {
                          const ans = practiceExercise.type === 'multiple-choice' ? selectedPracticeOption : practiceAnswer;
                          if (!ans.trim()) return;
                          const correct = (ans.trim().toLowerCase() === String(practiceExercise.correctAnswer || '').trim().toLowerCase());
                          setIsPracticeCorrect(correct);
                          setShowPracticeResult(true);
                          if (correct) soundEngine.playCorrect();
                          else soundEngine.playWrong();
                        }}
                        disabled={practiceExercise.type === 'multiple-choice' ? !selectedPracticeOption : !practiceAnswer.trim()}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold rounded-xl shadow-md text-sm transition-all active:scale-95"
                      >
                        Проверить ответ
                      </button>
                    ) : (
                      <button
                        onClick={fetchPracticeExercise}
                        className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl shadow-lg text-sm transition-all active:scale-95 flex items-center gap-2"
                      >
                        <span>Следующее задание</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <button
                    onClick={fetchPracticeExercise}
                    className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg"
                  >
                    Запустить практику 🚀
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* AI TUTOR CHAT TAB */
            <div className="flex flex-col h-full space-y-4 animate-fade-in">
              {/* Tutor Suggestions */}
              {theoryData?.tutorSuggestions?.length > 0 && messages.length <= 2 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-purple-400 tracking-wider">
                    Быстрые вопросы репетитору:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {theoryData.tutorSuggestions.map((sug, idx) => (
                      <button
                        key={idx}
                        onClick={() => sendMessage(sug)}
                        className="text-xs px-3 py-1.5 rounded-full bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 transition-all text-left active:scale-95"
                      >
                        ✨ {sug}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages Container */}
              <div className="flex-1 space-y-3 min-h-[300px]">
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[88%] sm:max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white rounded-br-none shadow-md'
                          : 'bg-slate-800 text-gray-100 rounded-bl-none border border-slate-700/80 shadow-md'
                      }`}
                    >
                      <FormattedMessage content={m.content} />
                    </div>
                  </div>
                ))}

                {sendingMessage && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800 text-gray-300 rounded-2xl rounded-bl-none px-4 py-3 border border-slate-700 flex items-center space-x-2">
                      <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                      <span className="text-xs">Репетитор формулирует ответ...</span>
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className={`p-4 border-t ${borderCol} bg-slate-900/60 flex-shrink-0 flex items-center justify-between gap-3`}>
          {activeTab === 'tutor' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="flex-1 flex items-center space-x-2"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Спроси у репетитора что угодно по этой теме..."
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-gray-100 placeholder-gray-400 focus:outline-none focus:border-purple-500 transition-all"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || sendingMessage}
                className="p-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white hover:from-purple-600 hover:to-fuchsia-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          ) : (
            <div className="w-full flex justify-between items-center">
              <button
                onClick={() => setActiveTab('tutor')}
                className="flex items-center space-x-2 text-xs sm:text-sm font-semibold text-purple-400 hover:text-purple-300 transition-all"
              >
                <Bot className="h-4 w-4" />
                <span>Задать вопрос AI-репетитору</span>
              </button>

              {onStartPractice && (
                <button
                  onClick={() => {
                    onClose();
                    onStartPractice(topicId);
                  }}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold text-sm shadow-lg hover:from-fuchsia-600 hover:to-purple-700 transition-all"
                >
                  <span>Тренировать тему</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
