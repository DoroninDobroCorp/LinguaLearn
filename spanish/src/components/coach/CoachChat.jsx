import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mic, Send, X, Check, Lightbulb, Languages, Flag, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { blobToBase64, coachApi, stripDisfluencies } from '../../utils/coachApi';
import { useVoiceRecorder, isVoiceRecordingSupported } from '../../hooks/useVoiceRecorder';
import { microphoneBlockReason } from '../../utils/coachApi';
import { playCoachSpeech, stopCoachSpeech, unlockCoachAudio } from '../../hooks/useCoachSpeech';
import { CoachPage, CorrectionDiff, ErrorNote, MicUnavailable, PartnerAvatar, SpeakButton, Spinner, TypingDots } from './CoachUI';

const ANALYSIS_STEPS = [
  'Перечитываю твои сообщения…',
  'Отделяю настоящие ошибки от аргентинских особенностей…',
  'Группирую ошибки в темы…',
  'Собираю тренировку из твоих фраз…',
];

function FeedbackChip({ message, onLoadFeedback, onRetryFeedback }) {
  const [open, setOpen] = useState(false);
  const feedback = message.feedback;

  useEffect(() => {
    if (message.feedbackPending && !feedback) onLoadFeedback(message.id);
  }, [message.feedbackPending, feedback, message.id, onLoadFeedback]);

  if (message.temp) return null;
  if (!feedback) {
    if (message.feedbackFailed) {
      return (
        <div className="mt-1 mr-1 text-[12px] c-muted inline-flex items-center gap-2">
          Не удалось проверить
          <button type="button" onClick={() => onRetryFeedback(message.id)} className="font-bold c-accent underline underline-offset-2">Повторить</button>
        </div>
      );
    }
    if (!message.feedbackPending) return null;
    return <div className="mt-1 mr-1 text-[11px] c-faint inline-flex items-center gap-1"><Spinner className="w-3 h-3" /> проверяю</div>;
  }

  const retractedNote = feedback.retracted_note_ru && (
    <span className="text-[12px] c-muted max-w-[85%] text-right">Уточнение после разбора: {feedback.retracted_note_ru}</span>
  );
  if (feedback.verdict === 'perfect') {
    return (
      <div className="mt-1 mr-1 flex flex-col items-end gap-1">
        <span className="text-[11px] font-bold c-good inline-flex items-center gap-1"><Check className="w-3 h-3" /> без ошибок</span>
        {retractedNote}
        {feedback.praise_ru && <span className="text-[12px] c-bg-good rounded-lg px-2.5 py-1 max-w-[85%] text-right">{feedback.praise_ru}</span>}
        {feedback.natural && (
          <span className="text-[12px] c-muted max-w-[85%] text-right">По-аргентински можно и так: <i className="c-text">{feedback.natural}</i></span>
        )}
      </div>
    );
  }

  // Corrections are shown right away (not hidden behind a pill): after a voice
  // message attention goes to Lucía's spoken reply and a collapsed chip is missed.
  const tone = feedback.verdict === 'minor' ? 'var(--c-warn)' : 'var(--c-bad)';
  const original = message.input_mode === 'text' ? message.content : stripDisfluencies(message.content);
  return (
    <div className="mt-1.5 w-full flex justify-end">
      <div className="c-card rounded-2xl px-3.5 py-2.5 max-w-[92%] text-left animate-fade-in" style={{ borderLeft: `3px solid ${tone}` }}>
        <ul className="space-y-1.5">
          {feedback.issues.map((issue, index) => (
            <li key={index} className="text-[14px] leading-snug">
              <span className="line-through c-bad">{issue.original}</span>
              <span className="c-faint mx-1">→</span>
              <span className="font-semibold c-good">{issue.fix}</span>
              {open && <span className="block text-[13px] c-muted mt-0.5">{issue.explanation_ru}</span>}
            </li>
          ))}
        </ul>
        {open && (
          <div className="mt-3 pt-3 border-t c-border">
            <div className="text-[12px] c-muted mb-1">Вся фраза правильно{message.input_mode !== 'text' ? ' (без «eh» и повторов)' : ''}:</div>
            <div className="text-[15px] c-text"><CorrectionDiff original={original} corrected={feedback.corrected} /></div>
            <div className="mt-1.5"><SpeakButton text={feedback.corrected} speechKey={`fix-${message.id}`} label="Как это звучит" /></div>
            {feedback.natural && (
              <div className="mt-3 text-[13px]">
                <span className="c-muted">Естественнее по-аргентински: </span>
                <span className="c-text italic">{feedback.natural}</span>
              </div>
            )}
            {feedback.praise_ru && <div className="mt-2 text-[12px] c-good">{feedback.praise_ru}</div>}
            {feedback.retracted_note_ru && <div className="mt-2 text-[12px] c-muted">Уточнение после разбора: {feedback.retracted_note_ru}</div>}
          </div>
        )}
        <button type="button" onClick={() => setOpen((value) => !value)} className="mt-1.5 text-[12px] font-semibold c-muted inline-flex items-center gap-1 hover:opacity-80">
          {open ? 'Свернуть' : 'Почему так и вся фраза'}
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
}

function PartnerMessage({ message, partner, voice, voiceStyle }) {
  const [translation, setTranslation] = useState(message.translation_ru || '');
  const [showTranslation, setShowTranslation] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggleTranslation = async () => {
    if (showTranslation) {
      setShowTranslation(false);
      return;
    }
    setShowTranslation(true);
    if (translation || message.temp) return;
    setLoading(true);
    try {
      const { translation_ru: text } = await coachApi.translate(message.id);
      setTranslation(text);
    } catch {
      setTranslation('Не удалось перевести.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-end gap-2 max-w-[88%]">
      <PartnerAvatar name={partner?.name} size={30} />
      <div>
        <div className="c-bubble-them rounded-2xl rounded-bl-md px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">{message.content}</div>
        {showTranslation && (
          <div className="text-[13px] c-muted mt-1 px-1 leading-snug">{loading ? <Spinner className="w-3 h-3" /> : translation}</div>
        )}
        <div className="flex items-center gap-4 mt-1 px-1">
          <SpeakButton text={message.content} speechKey={`m-${message.id}`} voice={voice} style={voiceStyle} label="Слушать" />
          <button type="button" onClick={toggleTranslation} className="inline-flex items-center gap-1.5 text-xs font-semibold c-muted hover:opacity-80">
            <Languages className="w-3.5 h-3.5" /> {showTranslation ? 'Скрыть' : 'Перевод'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatSeconds(ms) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function CoachChat() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [learner, setLearner] = useState(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [needsRetry, setNeedsRetry] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [showMicNotice, setShowMicNotice] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const recorder = useVoiceRecorder();
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const autoplayedRef = useRef(new Set());
  const voiceSupported = isVoiceRecordingSupported();

  const partner = session?.partner || { name: 'Lucía' };
  const voice = partner.voice || learner?.partner_voice || 'Sulafat';
  const voiceStyle = partner.formal ? 'formal' : undefined;

  useEffect(() => {
    let cancelled = false;
    Promise.all([coachApi.session(sessionId), coachApi.profile()])
      .then(([detail, profile]) => {
        if (cancelled) return;
        if (detail.mode === 'call') {
          navigate(detail.status === 'active' ? `/coach/call/${detail.id}` : `/coach/report/${detail.id}`, { replace: true });
          return;
        }
        if (detail.status !== 'active') {
          navigate(`/coach/report/${detail.id}`, { replace: true });
          return;
        }
        setSession(detail);
        setLearner(profile.learner);
        setMessages(detail.messages.map((message) => ({ ...message, feedbackPending: message.role === 'user' && !message.feedback && profile.learner.show_inline_feedback })));
        const last = detail.messages[detail.messages.length - 1];
        setNeedsRetry(last?.role === 'user');
        // Existing messages count as already heard, except a fresh opening line.
        detail.messages.forEach((message) => autoplayedRef.current.add(message.id));
        if (detail.messages.length === 1 && last?.role === 'assistant') autoplayedRef.current.delete(last.id);
      })
      .catch((loadError) => setError(loadError.message));
    return () => {
      cancelled = true;
      stopCoachSpeech();
    };
  }, [sessionId, navigate]);

  // Autoplay new partner replies.
  useEffect(() => {
    if (!learner?.voice_autoplay) return;
    const last = messages[messages.length - 1];
    if (last && last.role === 'assistant' && !last.temp && !autoplayedRef.current.has(last.id)) {
      autoplayedRef.current.add(last.id);
      playCoachSpeech(last.content, { key: `m-${last.id}`, voice, style: voiceStyle, allowBrowserFallback: false });
    }
  }, [messages, learner, voice, voiceStyle]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
  }, [input]);

  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending, hint]);

  useEffect(() => {
    if (!finishing) return undefined;
    const timer = setInterval(() => setAnalysisStep((step) => Math.min(step + 1, ANALYSIS_STEPS.length - 1)), 5000);
    return () => clearInterval(timer);
  }, [finishing]);

  const updateMessage = useCallback((messageId, patch) => {
    setMessages((list) => list.map((message) => (message.id === messageId ? { ...message, ...patch } : message)));
  }, []);

  // The check runs in the background on the server; keep asking while it is
  // still working and say so plainly if it failed instead of hiding it.
  const loadFeedback = useCallback(async (messageId, attempt = 0) => {
    try {
      const data = await coachApi.feedback(messageId);
      if (data.feedback) {
        updateMessage(messageId, { feedback: data.feedback, feedbackPending: false, feedbackFailed: false });
        return;
      }
      if (data.pending && attempt < 3) {
        setTimeout(() => loadFeedback(messageId, attempt + 1), 1500);
        return;
      }
    } catch {
      if (attempt < 1) {
        setTimeout(() => loadFeedback(messageId, attempt + 1), 2000);
        return;
      }
    }
    updateMessage(messageId, { feedbackPending: false, feedbackFailed: true });
  }, [updateMessage]);

  const retryFeedback = useCallback((messageId) => {
    updateMessage(messageId, { feedbackPending: true, feedbackFailed: false });
  }, [updateMessage]);

  const applyResult = (tempId, result) => {
    setMessages((list) => [
      ...list.filter((message) => message.id !== tempId),
      {
        ...result.user_message,
        feedbackPending: result.feedback_pending && learner?.show_inline_feedback,
        feedbackFailed: Boolean(result.feedback_failed),
      },
      result.assistant_message,
    ]);
    setNeedsRetry(false);
  };

  const handleSendError = (tempId, sendError, { keepUserMessage }) => {
    if (sendError.code === 'REPLY_FAILED' && keepUserMessage) {
      // The message is saved on the server; only the reply is missing.
      coachApi.session(sessionId).then((detail) => {
        setMessages(detail.messages.map((message) => ({ ...message, feedbackPending: message.role === 'user' && !message.feedback && learner?.show_inline_feedback })));
        setNeedsRetry(true);
      }).catch(() => {});
    } else {
      setMessages((list) => list.filter((message) => message.id !== tempId));
    }
    setError(sendError.message);
  };

  const sendText = async (textOverride) => {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;
    unlockCoachAudio();
    stopCoachSpeech();
    setError('');
    setHint(null);
    setInput('');
    const tempId = `temp-${Date.now()}`;
    setMessages((list) => [...list, { id: tempId, role: 'user', content: text, input_mode: 'text', temp: true }]);
    setSending(true);
    try {
      applyResult(tempId, await coachApi.sendText(sessionId, text));
    } catch (sendError) {
      if (sendError.code !== 'REPLY_FAILED') setInput(text);
      handleSendError(tempId, sendError, { keepUserMessage: true });
    } finally {
      setSending(false);
      textareaRef.current?.focus({ preventScroll: true });
    }
  };

  const toggleRecording = async () => {
    if (!voiceSupported) {
      setShowMicNotice(true);
      return;
    }
    unlockCoachAudio();
    if (recorder.isRecording) {
      const recording = await recorder.stop();
      if (!recording) return;
      if (recording.durationMs < 700) {
        setError('Слишком коротко — держи запись хотя бы секунду.');
        return;
      }
      setError('');
      setHint(null);
      const tempId = `temp-${Date.now()}`;
      setMessages((list) => [...list, { id: tempId, role: 'user', content: '🎙 Распознаю…', input_mode: 'voice', temp: true }]);
      setSending(true);
      try {
        const audio = await blobToBase64(recording.blob);
        applyResult(tempId, await coachApi.sendAudio(sessionId, audio, recording.mimeType));
      } catch (sendError) {
        handleSendError(tempId, sendError, { keepUserMessage: sendError.code === 'REPLY_FAILED' });
      } finally {
        setSending(false);
      }
      return;
    }
    stopCoachSpeech();
    recorder.clearError();
    await recorder.start();
  };

  const retry = async () => {
    setError('');
    setSending(true);
    try {
      const { assistant_message: assistantMessage } = await coachApi.retryReply(sessionId);
      setMessages((list) => [...list, assistantMessage]);
      setNeedsRetry(false);
    } catch (retryError) {
      setError(retryError.message);
    } finally {
      setSending(false);
    }
  };

  const askHint = async () => {
    if (hint) {
      setHint(null);
      return;
    }
    setHintLoading(true);
    try {
      setHint(await coachApi.hint(sessionId));
    } catch (hintError) {
      setError(hintError.message);
    } finally {
      setHintLoading(false);
    }
  };

  const finish = async () => {
    if (recorder.isRecording) recorder.cancel();
    stopCoachSpeech();
    setFinishing(true);
    setAnalysisStep(0);
    try {
      await coachApi.finish(sessionId);
    } catch {
      // The report page polls and offers a retry if analysis failed.
    }
    navigate(`/coach/report/${sessionId}`, { replace: true });
  };

  const userCount = messages.filter((message) => message.role === 'user' && !message.temp).length;

  if (!session) {
    return (
      <CoachPage narrow>
        {error ? <ErrorNote message={error} /> : <div className="py-24 flex justify-center c-muted"><Spinner className="w-6 h-6" /></div>}
      </CoachPage>
    );
  }

  return (
    <CoachPage narrow>
      <div className="flex flex-col" style={{ height: 'calc(100dvh - 11.5rem - env(safe-area-inset-bottom, 0px))', minHeight: 420 }}>
        <div className="flex items-center justify-between gap-3 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/" className="c-muted hover:opacity-80 -ml-1 p-1" aria-label="На главную"><ArrowLeft className="w-5 h-5" /></Link>
            <PartnerAvatar name={partner.name} size={40} />
            <div className="min-w-0">
              <div className="font-extrabold c-text leading-tight truncate">{partner.name}</div>
              <div className="text-xs c-muted truncate">{session.scenario ? `${session.scenario.emoji} ${session.scenario.title_ru}` : `${session.topic?.emoji || '☕'} ${session.topic?.title_ru || partner.role_ru}`}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={finish}
            disabled={userCount < 1 || finishing || sending}
            className="c-btn-primary px-3.5 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Flag className="w-4 h-4" /> Завершить
          </button>
        </div>

        {session.scenario?.goal_ru && (
          <div className="c-panel rounded-xl px-3.5 py-2 text-[13px] mb-2"><span className="c-muted">Твоя цель: </span><span className="c-text font-semibold">{session.scenario.goal_ru}</span></div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 py-2 pr-1 -mr-1">
          {messages.map((message) => (message.role === 'assistant' ? (
            <PartnerMessage key={message.id} message={message} partner={partner} voice={voice} voiceStyle={voiceStyle} />
          ) : (
            <div key={message.id} className="flex flex-col items-end">
              <div className={`c-bubble-me rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] leading-relaxed max-w-[85%] whitespace-pre-wrap ${message.temp ? 'opacity-70' : ''}`}>
                {message.input_mode === 'voice' && !message.temp && <Mic className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5 opacity-70" />}
                {message.content}
              </div>
              <FeedbackChip message={message} onLoadFeedback={loadFeedback} onRetryFeedback={retryFeedback} />
            </div>
          )))}
          {sending && <div className="pl-10"><TypingDots label={`${partner.name} пишет…`} /></div>}
          {needsRetry && !sending && (
            <div className="pl-10">
              <button type="button" onClick={retry} className="c-btn-ghost px-3 py-1.5 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4" /> Получить ответ
              </button>
            </div>
          )}
          {userCount >= 6 && userCount % 6 === 0 && !sending && (
            <div className="text-center text-xs c-muted">Хороший объём для разбора. Можно продолжать или нажать «Завершить».</div>
          )}
        </div>

        {hint && (
          <div className="c-card rounded-2xl p-3 mb-2 animate-fade-in">
            <div className="text-xs font-bold c-muted mb-2">Можно ответить так (нажми, чтобы вставить):</div>
            <div className="space-y-2">
              {hint.options.map((option, index) => (
                <button key={index} type="button" onClick={() => { setInput(option.es); setHint(null); textareaRef.current?.focus(); }} className="w-full text-left c-panel rounded-xl px-3 py-2 hover:opacity-90">
                  <div className="text-[14px] c-text">{option.es}</div>
                  <div className="text-[12px] c-muted">{option.ru}</div>
                </button>
              ))}
            </div>
            {hint.useful_words?.length > 0 && (
              <div className="text-[12px] c-muted mt-2">{hint.useful_words.map((word) => `${word.es} — ${word.ru}`).join(' · ')}</div>
            )}
          </div>
        )}

        {showMicNotice && <div className="mb-2"><MicUnavailable reason={microphoneBlockReason()} /></div>}
        {(error || recorder.error) && <div className="mb-2"><ErrorNote message={error || recorder.error} /></div>}

        <div className="c-card rounded-2xl p-2 flex items-end gap-2">
          {recorder.isRecording ? (
            <>
              <button type="button" onClick={recorder.cancel} className="w-11 h-11 rounded-xl c-btn-ghost flex items-center justify-center flex-shrink-0" aria-label="Отменить запись">
                <X className="w-5 h-5" />
              </button>
              <div className="flex-1 h-11 flex items-center gap-3 px-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="font-mono text-sm c-text">{formatSeconds(recorder.elapsedMs)}</span>
                <div className="flex-1 h-1.5 rounded-full c-track overflow-hidden">
                  <div className="h-full rounded-full transition-[width] duration-75" style={{ width: `${Math.round(recorder.level * 100)}%`, background: 'var(--c-accent)' }} />
                </div>
              </div>
              <button type="button" onClick={toggleRecording} className="w-11 h-11 rounded-xl c-btn-primary flex items-center justify-center flex-shrink-0" aria-label="Отправить голосовое">
                <Send className="w-5 h-5" />
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={askHint} disabled={hintLoading || sending} className="w-11 h-11 rounded-xl c-btn-ghost flex items-center justify-center flex-shrink-0" aria-label="Подсказка" title="Не знаю, что ответить">
                {hintLoading ? <Spinner className="w-5 h-5" /> : <Lightbulb className="w-5 h-5" />}
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    sendText();
                  }
                }}
                rows={1}
                maxLength={1200}
                placeholder="Escribí en español…"
                className="flex-1 resize-none bg-transparent outline-none c-text text-[15px] leading-6 py-2.5 px-1 max-h-32"
              />
              {input.trim() ? (
                <button type="button" onClick={() => sendText()} disabled={sending} className="w-11 h-11 rounded-xl c-btn-primary flex items-center justify-center flex-shrink-0" aria-label="Отправить">
                  <Send className="w-5 h-5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={toggleRecording}
                  disabled={sending || recorder.state === 'requesting' || recorder.state === 'processing'}
                  className="w-11 h-11 rounded-xl c-btn-primary flex items-center justify-center flex-shrink-0"
                  aria-label="Записать голосовое"
                  title={voiceSupported ? 'Записать голосовое' : 'Микрофон недоступен в этом браузере'}
                >
                  {recorder.state === 'requesting' ? <Spinner className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {finishing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" style={{ background: 'rgba(15, 10, 20, 0.45)', backdropFilter: 'blur(6px)' }}>
          <div className="c-card rounded-3xl p-7 max-w-sm w-full text-center">
            <PartnerAvatar name={partner.name} size={56} speaking />
            <div className="font-extrabold c-text text-lg mt-4">Готовлю разбор</div>
            <div className="c-muted text-sm mt-2 min-h-[2.5rem]">{ANALYSIS_STEPS[analysisStep]}</div>
            <div className="text-xs c-faint mt-3">Обычно 15–40 секунд</div>
          </div>
        </div>
      )}
    </CoachPage>
  );
}
