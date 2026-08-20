import React, { useState, useEffect, useRef } from 'react';
import { 
  X, BookOpen, Bot, Sparkles, Send, Volume2, CheckCircle2, 
  AlertTriangle, Lightbulb, ChevronRight, Loader2, ArrowRight,
  RotateCcw, Copy, Check
} from 'lucide-react';

import { useTheme } from '../contexts/ThemeContext';

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
        <div className={`flex items-center justify-between border-b ${borderCol} px-4 sm:px-6 bg-slate-800/30 flex-shrink-0`}>
          <div className="flex">
            <button
              onClick={() => setActiveTab('theory')}
              className={`flex items-center space-x-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all ${
                activeTab === 'theory'
                  ? 'border-fuchsia-500 text-fuchsia-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              <BookOpen className="h-4 w-4" />
              <span>Теория и Правила</span>
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
              <span>AI-Репетитор (Чат)</span>
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
              {theoryData?.summary && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-fuchsia-500/10 via-purple-500/10 to-transparent border border-fuchsia-500/30">
                  <div className="flex items-start space-x-3">
                    <Lightbulb className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm sm:text-base leading-relaxed font-medium">
                      {theoryData.summary}
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

              {/* Detailed Sections */}
              {theoryData?.sections?.map((sec, idx) => (
                <div key={idx} className={`p-4 sm:p-5 rounded-xl border ${cardBg} space-y-4`}>
                  <h3 className="text-base sm:text-lg font-bold text-fuchsia-400 flex items-center space-x-2">
                    <span>{sec.title}</span>
                  </h3>
                  
                  <div className={`text-sm sm:text-base leading-relaxed whitespace-pre-line ${subText}`}>
                    {sec.content}
                  </div>

                  {/* Tables if any */}
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
                    <span>Примеры предложений с озвучкой</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {theoryData.examples.map((ex, idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-slate-900/60 border border-slate-700/60 flex items-start justify-between space-x-2">
                        <div className="space-y-1">
                          <p className="font-bold text-sm text-gray-100">{ex.es}</p>
                          <p className="text-xs text-gray-400">{ex.ru}</p>
                          {ex.note && <p className="text-[11px] text-fuchsia-400 italic">💡 {ex.note}</p>}
                        </div>
                        <button
                          onClick={() => handleSpeak(ex.es)}
                          className="p-1.5 rounded-lg bg-slate-800 text-gray-300 hover:text-white hover:bg-fuchsia-600 transition-all flex-shrink-0"
                          title="Озвучить"
                        >
                          <Volume2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Common Mistakes */}
              {theoryData?.commonMistakes?.length > 0 && (
                <div className={`p-4 sm:p-5 rounded-xl border border-red-500/30 bg-red-950/20 space-y-3`}>
                  <h3 className="text-base sm:text-lg font-bold text-rose-400 flex items-center space-x-2">
                    <AlertTriangle className="h-5 w-5 text-rose-500" />
                    <span>Типичные ошибки студентов</span>
                  </h3>
                  <div className="space-y-2.5">
                    {theoryData.commonMistakes.map((m, idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-slate-900/70 border border-red-500/20 text-xs sm:text-sm space-y-1">
                        <p className="text-rose-400 line-through font-medium">❌ {m.wrong}</p>
                        <p className="text-emerald-400 font-bold">✅ {m.right}</p>
                        <p className="text-gray-300 text-xs">{m.explanation}</p>
                      </div>
                    ))}
                  </div>
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
