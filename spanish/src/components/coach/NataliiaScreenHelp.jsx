import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { Sparkles, X, Send, Camera, RefreshCw, ZoomIn, Bot, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useProfile } from '../../contexts/ProfileContext';
import { coachApi } from '../../utils/coachApi';

const QUICK_CHIPS = [
  '❓ Почему здесь именно такой ответ или форма?',
  '🔍 В чём здесь ошибка и как сказать правильно?',
  '🇦🇷 Как эту мысль естественно выразить в Аргентине?',
  '💡 Объясни логику этого правила простыми словами',
];

function formatMessageText(text) {
  if (!text) return null;

  // Split into lines for paragraph handling
  const lines = text.split('\n');

  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={lineIdx} className="h-1.5" />;

        // Header check: ### or ##
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={lineIdx} className="font-bold text-purple-900 dark:text-purple-200 mt-2 text-sm">
              {trimmed.slice(4)}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={lineIdx} className="font-extrabold text-purple-950 dark:text-purple-100 mt-2.5 text-base">
              {trimmed.slice(3)}
            </h3>
          );
        }

        // List item check: * or -
        const isListItem = /^[-*•]\s+/.test(trimmed);
        const itemContent = isListItem ? trimmed.replace(/^[-*•]\s+/, '') : trimmed;

        // Parse bold **text** and italics *text*
        const parts = [];
        const regex = /(\*\*.*?\*\*|\*[^*]+?\*)/g;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(itemContent)) !== null) {
          if (match.index > lastIndex) {
            parts.push(itemContent.substring(lastIndex, match.index));
          }
          const matchedText = match[0];
          if (matchedText.startsWith('**') && matchedText.endsWith('**')) {
            parts.push(
              <strong key={match.index} className="font-bold text-fuchsia-700 dark:text-fuchsia-300">
                {matchedText.slice(2, -2)}
              </strong>
            );
          } else if (matchedText.startsWith('*') && matchedText.endsWith('*')) {
            parts.push(
              <em key={match.index} className="italic text-indigo-700 dark:text-indigo-300 font-medium">
                {matchedText.slice(1, -1)}
              </em>
            );
          }
          lastIndex = regex.lastIndex;
        }

        if (lastIndex < itemContent.length) {
          parts.push(itemContent.substring(lastIndex));
        }

        if (isListItem) {
          return (
            <div key={lineIdx} className="flex items-start gap-2 pl-2">
              <span className="text-fuchsia-500 font-bold">•</span>
              <span className="flex-1">{parts}</span>
            </div>
          );
        }

        return <p key={lineIdx}>{parts}</p>;
      })}
    </div>
  );
}

export default function NataliiaScreenHelp() {
  const { activeProfile } = useProfile();

  // Show exclusively for Nataliia
  const isNataliia =
    activeProfile?.id === 10 ||
    activeProfile?.name?.toLowerCase() === 'nataliia' ||
    activeProfile?.name?.toLowerCase() === 'наталия' ||
    activeProfile?.learning_track === 'conversation';

  const [isOpen, setIsOpen] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [screenshotBase64, setScreenshotBase64] = useState(null);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState(null);
  const [showFullScreenshot, setShowFullScreenshot] = useState(false);
  const [isScreenshotExpanded, setIsScreenshotExpanded] = useState(true);

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages, isLoading]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isNataliia) {
    return null;
  }

  const captureScreen = async () => {
    try {
      setIsCapturing(true);
      setError(null);

      // Brief delay to let any button hover effects settle
      await new Promise((resolve) => setTimeout(resolve, 80));

      const canvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        logging: false,
        scale: Math.min(window.devicePixelRatio || 1, 1.5),
        ignoreElements: (el) => el.classList?.contains?.('screen-qa-ignore'),
      });

      const fullDataUrl = canvas.toDataURL('image/jpeg', 0.82);
      const cleanBase64 = fullDataUrl.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

      setScreenshotBase64(cleanBase64);
      setScreenshotDataUrl(fullDataUrl);
      return cleanBase64;
    } catch (err) {
      console.warn('[NataliiaScreenHelp] Screenshot capture fallback:', err);
      return null;
    } finally {
      setIsCapturing(false);
    }
  };

  const handleOpenClick = async () => {
    const shot = await captureScreen();
    setIsOpen(true);

    if (messages.length === 0) {
      setMessages([
        {
          role: 'assistant',
          content: 'Привет, Наталия! 👋 Я вижу твой экран. Что именно на нём вызвало вопрос или сомнение? Нажми быстрый вопрос ниже или напиши свой:',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  };

  const handleRetakeScreenshot = async () => {
    // Hide modal temporarily for clean capture
    setIsOpen(false);
    await new Promise((r) => setTimeout(r, 120));
    const shot = await captureScreen();
    setIsOpen(true);
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: '📸 Снимок экрана обновлён! Теперь я вижу твою новую страницу. Что здесь разобрать?',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const handleSendMessage = async (textOverride) => {
    const text = (textOverride || inputText).trim();
    if (!text || isLoading) return;

    setInputText('');
    setError(null);

    const userMsg = {
      role: 'user',
      content: text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setIsLoading(true);

    try {
      const payload = {
        screenshot: screenshotBase64,
        messages: nextHistory.map((m) => ({ role: m.role, content: m.content })),
        userQuestion: text,
        pageContext: window.location.pathname + window.location.search,
      };

      const res = await coachApi.screenChat(payload);

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.reply || 'Не удалось получить подробный ответ. Попробуйте переформулировать вопрос.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      console.error('[NataliiaScreenHelp] Error querying Gemini:', err);
      setError(err?.message || 'Не удалось связаться с Gemini. Пожалуйста, попробуйте ещё раз.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <>
      {/* Floating Action Button (Always visible on all screens for Nataliia) */}
      {!isOpen && (
        <div className="screen-qa-ignore fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 select-none">
          <button
            type="button"
            onClick={handleOpenClick}
            disabled={isCapturing}
            className="flex items-center gap-2 px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-full font-extrabold text-xs sm:text-sm text-white bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 shadow-xl hover:shadow-2xl active:scale-95 transition-all duration-200 border border-white/30 backdrop-blur-md group"
            title="Непонятно почему так? Нажмите, чтобы разобрать этот экран с ИИ"
            aria-label="Почему так? Обсудить с ИИ"
          >
            {isCapturing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span className="tracking-tight">Снимок экрана...</span>
              </>
            ) : (
              <>
                <div className="relative flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
                </div>
                <span className="tracking-tight drop-shadow-sm">❓ Почему так?</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Slide-over / Modal Chat Dialog */}
      {isOpen && (
        <div className="screen-qa-ignore fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:justify-end sm:p-6 bg-black/40 backdrop-blur-xs transition-opacity animate-fadeIn">
          <div
            className="w-full sm:w-[480px] md:w-[520px] max-w-full h-[88vh] sm:h-[82vh] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-t-3xl sm:rounded-3xl shadow-2xl border border-purple-200/80 dark:border-purple-800/80 flex flex-col overflow-hidden animate-slideUp"
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className="px-4 py-3 sm:px-5 sm:py-3.5 border-b border-purple-100 dark:border-purple-900/60 bg-gradient-to-r from-purple-50 via-fuchsia-50 to-pink-50 dark:from-purple-950/40 dark:via-slate-900/40 dark:to-fuchsia-950/40 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-gradient-to-tr from-purple-600 to-fuchsia-500 text-white shadow-md">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <span>Помощник Наталии</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-fuchsia-100 dark:bg-fuchsia-950/80 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-200 dark:border-fuchsia-800">
                      B1 • Экран
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Gemini видит ваш текущий экран и готов разобрать нюансы
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Attached Screenshot Bar */}
            {screenshotDataUrl && (
              <div className="px-4 py-2 bg-purple-50/70 dark:bg-slate-800/60 border-b border-purple-100/70 dark:border-purple-900/40 flex-shrink-0">
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => setIsScreenshotExpanded(!isScreenshotExpanded)}
                    className="flex items-center gap-2 text-purple-900 dark:text-purple-200 font-bold hover:opacity-80 transition-opacity"
                  >
                    <Camera className="w-3.5 h-3.5 text-fuchsia-600 dark:text-fuchsia-400" />
                    <span>Скриншот экрана прикреплён</span>
                    {isScreenshotExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleRetakeScreenshot}
                    disabled={isCapturing}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-fuchsia-700 dark:text-fuchsia-300 hover:bg-fuchsia-100 dark:hover:bg-fuchsia-950/60 transition-colors"
                    title="Сделать новый снимок страницы"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Обновить снимок</span>
                  </button>
                </div>

                {isScreenshotExpanded && (
                  <div className="mt-2 relative group flex items-center justify-center bg-black/5 dark:bg-black/30 rounded-xl overflow-hidden border border-purple-200/50 dark:border-purple-800/50 max-h-28">
                    <img
                      src={screenshotDataUrl}
                      alt="Скриншот текущего экрана"
                      className="object-cover w-full h-28 opacity-90 group-hover:opacity-100 transition-opacity cursor-pointer"
                      onClick={() => setShowFullScreenshot(true)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowFullScreenshot(true)}
                      className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 text-white text-xs font-bold transition-opacity"
                    >
                      <ZoomIn className="w-4 h-4" />
                      <span>Увеличить скриншот</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl p-3 sm:p-3.5 shadow-sm text-sm ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white rounded-br-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-xs border border-slate-200/60 dark:border-slate-700/60'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      formatMessageText(msg.content)
                    ) : (
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    )}
                    <div
                      className={`text-[10px] mt-1.5 text-right font-medium ${
                        msg.role === 'user' ? 'text-purple-200' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {msg.time}
                    </div>
                  </div>
                </div>
              ))}

              {/* Quick suggestions when conversation starts */}
              {messages.length <= 2 && !isLoading && (
                <div className="pt-2">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-fuchsia-500" />
                    <span>Быстрые вопросы по экрану:</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {QUICK_CHIPS.map((chip, chipIdx) => (
                      <button
                        key={chipIdx}
                        type="button"
                        onClick={() => handleSendMessage(chip)}
                        className="text-left text-xs font-medium px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-900 dark:text-purple-200 border border-purple-200/60 dark:border-purple-800/60 transition-all hover:scale-[1.01] active:scale-[0.99]"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Loading Indicator */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-bl-xs p-3.5 shadow-sm border border-slate-200/60 dark:border-slate-700/60 flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-fuchsia-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="font-medium">Gemini изучает скриншот и готовит ответ...</span>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300">
                  <p className="font-bold">Не удалось получить ответ</p>
                  <p className="mt-0.5">{error}</p>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-purple-100 dark:border-purple-900/60 flex-shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Спроси, например: «Почему здесь por, а не para?»..."
                  disabled={isLoading}
                  className="flex-1 px-3.5 py-2.5 rounded-xl text-sm bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 transition-all placeholder:text-slate-400"
                />

                <button
                  type="submit"
                  disabled={!inputText.trim() || isLoading}
                  className="p-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white font-bold hover:from-purple-500 hover:to-fuchsia-500 shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  aria-label="Отправить вопрос"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Screenshot Modal */}
      {showFullScreenshot && screenshotDataUrl && (
        <div className="screen-qa-ignore fixed inset-0 z-60 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setShowFullScreenshot(false)}
              className="absolute -top-10 right-0 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition-colors"
              aria-label="Закрыть просмотр"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={screenshotDataUrl}
              alt="Полный скриншот экрана"
              className="max-h-[85vh] w-auto object-contain rounded-2xl shadow-2xl border border-white/20"
            />
          </div>
        </div>
      )}
    </>
  );
}
