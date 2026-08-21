import React, { useState, useEffect, useRef } from 'react';
import {
  X, BookOpen, Bot, Sparkles, Send, Volume2, CheckCircle2,
  AlertTriangle, Lightbulb, ChevronRight, Loader2, ArrowRight,
  RotateCcw, Copy, Check, HelpCircle, XCircle
} from 'lucide-react';
import { profileApiUrl, profileFetch } from '../utils/api';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { soundEngine, speakSpanish } from '../utils/soundEffects';
import MateoCharacter from './MateoCharacter';

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

        const isBullet = line.trim().startsWith('* ') || line.trim().startsWith('- ') || line.trim().startsWith('• ');
        const cleanLine = isBullet ? line.trim().replace(/^[*•\-]\s*/, '') : line;
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
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState('theory'); // theory | tutor
  const [theoryData, setTheoryData] = useState(null);
  const [loadingTheory, setLoadingTheory] = useState(true);

  // Quiz state inside theory modal
  const [quizAnswers, setQuizAnswers] = useState({});

  // AI Tutor State
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    if (isOpen && topicId) {
      fetchTheory();
      setQuizAnswers({});
    }
  }, [isOpen, topicId]);

  useEffect(() => {
    if (activeTab === 'tutor' && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const fetchTheory = async () => {
    try {
      setLoadingTheory(true);
      const res = await profileFetch(profileApiUrl(`/spanish/api/curriculum/topics/${topicId}/theory`));
      if (res.ok) {
        const data = await res.json();
        setTheoryData(data.theory || null);
      }
    } catch (error) {
      console.error('Error fetching topic theory:', error);
    } finally {
      setLoadingTheory(false);
    }
  };

  const handleSendTutorMessage = async (e) => {
    e?.preventDefault();
    if (!inputText.trim() || sendingMessage) return;

    const userText = inputText.trim();
    setInputText('');
    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    setSendingMessage(true);

    try {
      const res = await profileFetch(profileApiUrl(`/spanish/api/curriculum/topics/${topicId}/tutor-chat`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          history: messages
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'model', content: data.reply }]);
      }
    } catch (error) {
      console.error('Error in tutor chat:', error);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleQuizAnswer = async (qIdx, optIdx, correctIdx) => {
    if (quizAnswers[qIdx] !== undefined) return;
    const isCorrect = optIdx === correctIdx;
    if (isCorrect) soundEngine.playCorrect();
    else soundEngine.playWrong();
    setQuizAnswers(prev => ({ ...prev, [qIdx]: optIdx }));

    try {
      await profileFetch(profileApiUrl('/spanish/api/topics/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId,
          success: isCorrect,
          quality: isCorrect ? 4 : 1,
          activityType: 'theory_quiz',
          eventId: globalThis.crypto?.randomUUID?.() || 'theory-' + topicId + '-' + qIdx + '-' + Date.now(),
        }),
      });
      window.dispatchEvent(new CustomEvent('gamification_updated'));
    } catch (error) {
      console.error('Error recording theory quiz evidence:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-gray-850 rounded-3xl max-w-4xl w-full h-[90vh] shadow-2xl border border-purple-100 dark:border-gray-700 flex flex-col overflow-hidden relative">
        {/* Header */}
        <div className="px-6 py-4 border-b border-purple-100 dark:border-gray-700 flex items-center justify-between bg-white/80 dark:bg-gray-800/80 backdrop-blur-md">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center text-white text-xl shadow-md">
              {theoryData?.icon || '📖'}
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 dark:text-white">
                {theoryData?.russianTitle || topicName}
              </h2>
              <div className="flex items-center space-x-2 text-xs text-purple-600 dark:text-purple-400 font-semibold">
                <span>{topicName}</span>
                {theoryData?.level && (
                  <span className="bg-purple-100 dark:bg-purple-900/60 px-2 py-0.5 rounded-full">
                    {theoryData.level}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tab Switcher: Theory vs AI Tutor */}
        <div className="flex border-b border-purple-100 dark:border-gray-700 px-6 bg-gray-50/80 dark:bg-gray-800/50">
          <button
            onClick={() => setActiveTab('theory')}
            className={`py-3 px-5 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'theory'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Интерактивная теория</span>
          </button>

          <button
            onClick={() => setActiveTab('tutor')}
            className={`py-3 px-5 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'tutor'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Чат с репетитором по теме</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
          {loadingTheory ? (
            <div className="flex items-center justify-center h-64 text-purple-600">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="ml-3 font-semibold text-sm">Загрузка теории...</span>
            </div>
          ) : activeTab === 'theory' ? (
            theoryData ? (
              <div className="space-y-6">
                {/* Mateo Guide Intro for this Topic */}
                <div className="p-4 rounded-3xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200 dark:border-amber-800">
                  <MateoCharacter
                    mood="thinking"
                    speechText={
                      language === 'ru'
                        ? `Привет! Давай разберем «${theoryData.russianTitle || topicName}». Я подготовил для тебя схему и проверочный квиз внизу!`
                        : language === 'es'
                        ? `¡Hola! Veamos juntos «${theoryData.topicName}». ¡Tengo un esquema y un mini-quiz para ti!`
                        : `Hello! Let's master "${theoryData.topicName}". I prepared a visual guide and mini-quiz below!`
                    }
                    size="sm"
                  />
                </div>

                {/* Summary Box */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border border-purple-200 dark:border-purple-800/50 text-gray-800 dark:text-gray-200 text-sm sm:text-base leading-relaxed">
                  💡 <span className="font-semibold">{theoryData.summary}</span>
                </div>

                {/* Mnemonic Banner */}
                {theoryData.mnemonicRule && (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-extrabold text-sm sm:text-base shadow-md flex items-center gap-3">
                    <span className="text-2xl">🧠</span>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-amber-200">Золотое правило:</div>
                      <div>{theoryData.mnemonicRule}</div>
                    </div>
                  </div>
                )}

                {/* Visual SVG Diagram */}
                {theoryData.visualSvg && (
                  <div
                    className="rounded-2xl overflow-hidden shadow-lg border border-purple-200 dark:border-gray-700 my-4"
                    dangerouslySetInnerHTML={{ __html: theoryData.visualSvg }}
                  />
                )}

                {/* Sections and Tables */}
                {(theoryData.sections || []).map((sec, sIdx) => (
                  <div key={sIdx} className="space-y-3 pt-2">
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-fuchsia-500" />
                      {sec.title}
                    </h3>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                      {sec.content}
                    </p>

                    {/* Tables */}
                    {(sec.tables || []).map((tbl, tIdx) => (
                      <div key={tIdx} className="overflow-x-auto rounded-2xl border border-purple-100 dark:border-gray-700 shadow-sm my-3">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-purple-100 dark:bg-gray-800 text-purple-900 dark:text-purple-200 font-bold">
                            <tr>
                              {tbl.headers.map((h, hIdx) => (
                                <th key={hIdx} className="p-3 whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-purple-50 dark:divide-gray-700 bg-white dark:bg-gray-850">
                            {tbl.rows.map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-purple-50/50 dark:hover:bg-gray-800/50 transition-colors">
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="p-3 text-gray-800 dark:text-gray-200">
                                    <div className="flex items-center justify-between gap-2">
                                      <span>{cell}</span>
                                      {cIdx === 1 && typeof cell === 'string' && cell.length > 1 && (
                                        <button
                                          onClick={() => speakSpanish(cell.split('(')[0])}
                                          className="text-gray-400 hover:text-purple-600 p-1 transition-colors"
                                          title="Прослушать"
                                        >
                                          <Volume2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                ))}

                {/* Trap Alert */}
                {theoryData.trapAlert && (
                  <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-sm flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">⚠️ Осторожно, частая ловушка:</div>
                      <div className="mt-0.5">{theoryData.trapAlert}</div>
                    </div>
                  </div>
                )}

                {/* Dialect Note */}
                {theoryData.dialectNote && (
                  <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 text-sm flex items-start gap-3">
                    <span className="text-xl">🧉</span>
                    <div>
                      <div className="font-bold">Колорит и диалекты (Рио-де-ла-Плата / Испания):</div>
                      <div className="mt-0.5">{theoryData.dialectNote}</div>
                    </div>
                  </div>
                )}

                {/* Quick Check Quiz inside Theory */}
                {theoryData.quickCheckQuiz && theoryData.quickCheckQuiz.length > 0 && (
                  <div className="pt-6 border-t border-purple-100 dark:border-gray-700 space-y-4">
                    <h3 className="text-base font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                      <HelpCircle className="w-5 h-5 text-purple-600" />
                      Проверь себя прямо сейчас:
                    </h3>

                    {theoryData.quickCheckQuiz.map((q, qIdx) => {
                      const answered = quizAnswers[qIdx] !== undefined;
                      const selectedOpt = quizAnswers[qIdx];

                      return (
                        <div key={qIdx} className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                          <p className="font-bold text-sm text-gray-900 dark:text-white mb-3">
                            {qIdx + 1}. {q.question}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {q.options.map((opt, optIdx) => {
                              let btnClass = 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:border-purple-400';
                              if (answered) {
                                if (optIdx === q.correctIndex) {
                                  btnClass = 'bg-green-100 dark:bg-green-900/60 border-green-500 text-green-900 dark:text-green-200 font-bold';
                                } else if (optIdx === selectedOpt) {
                                  btnClass = 'bg-red-100 dark:bg-red-900/60 border-red-500 text-red-900 dark:text-red-200';
                                } else {
                                  btnClass = 'opacity-40';
                                }
                              }

                              return (
                                <button
                                  key={optIdx}
                                  onClick={() => handleQuizAnswer(qIdx, optIdx, q.correctIndex)}
                                  disabled={answered}
                                  className={`p-3 text-left rounded-xl border text-xs font-semibold transition-all ${btnClass}`}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                          {answered && (
                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
                              💡 {q.explanation}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-16 text-gray-500">
                <BookOpen className="w-12 h-12 text-purple-400 mx-auto mb-3" />
                <h4 className="font-bold text-gray-800 dark:text-gray-200 text-lg mb-1">
                  Теория по теме «{topicName}»
                </h4>
                <p className="text-sm max-w-md mx-auto mb-4">
                  Вы можете задать любой вопрос нашему AI-репетитору во вкладке «Чат с репетитором»!
                </p>
                <button
                  onClick={() => setActiveTab('tutor')}
                  className="px-6 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold rounded-xl shadow"
                >
                  Спросить у AI-репетитора 🤖
                </button>
              </div>
            )
          ) : (
            /* AI Tutor Chat Tab */
            <div className="flex flex-col h-full space-y-4">
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl p-4 bg-purple-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-purple-200 dark:border-gray-700">
                    ¡Hola! Я твой личный репетитор по теме «{topicName}». Готов разобрать любые вопросы, привести примеры или дать тренировочные упражнения. Чем могу помочь?
                  </div>
                </div>

                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${
                        m.role === 'user'
                          ? 'bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white'
                          : 'bg-purple-50 dark:bg-gray-800 text-gray-900 dark:text-white border border-purple-200 dark:border-gray-700'
                      }`}
                    >
                      <FormattedMessage content={m.content} />
                    </div>
                  </div>
                ))}

                {sendingMessage && (
                  <div className="flex justify-start">
                    <div className="bg-purple-50 dark:bg-gray-800 rounded-2xl p-4 flex items-center space-x-2">
                      <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                      <span className="text-xs text-gray-500">Репетитор думает...</span>
                    </div>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              <form onSubmit={handleSendTutorMessage} className="flex gap-2 pt-2 border-t border-purple-100 dark:border-gray-700">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={`Спроси что угодно по теме ${topicName}...`}
                  disabled={sendingMessage}
                  className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-purple-200 dark:border-gray-700 rounded-xl focus:border-purple-500 focus:outline-none text-sm text-gray-900 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || sendingMessage}
                  className="p-3 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white rounded-xl shadow disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-purple-100 dark:border-gray-700 flex items-center justify-between bg-gray-50/80 dark:bg-gray-800/80">
          <button
            onClick={onClose}
            className="px-5 py-2 text-gray-600 dark:text-gray-300 font-bold text-sm hover:underline"
          >
            Закрыть
          </button>

          {onStartPractice && (
            <button
              onClick={() => {
                onClose();
                onStartPractice();
              }}
              className="px-6 py-2.5 bg-gradient-to-r from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 text-sm flex items-center gap-2"
            >
              <span>Перейти к практике</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
