import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Mic, MicOff, PhoneOff, Phone, Keyboard, Send, Captions, Headphones } from 'lucide-react';
import { coachApi, coachLiveUrl, microphoneBlockReason } from '../../utils/coachApi';
import { CoachPage, ErrorNote, MicUnavailable, PartnerAvatar, Spinner } from './CoachUI';

const MAX_RECONNECTS = 2;

function createAudioContext(sampleRate) {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio не поддерживается этим браузером.');
  try {
    return new Ctor({ sampleRate });
  } catch {
    return new Ctor();
  }
}

function downsampleTo16k(input, inputRate) {
  if (inputRate === 16000) return input;
  const ratio = inputRate / 16000;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.max(start + 1, Math.min(input.length, Math.floor((index + 1) * ratio)));
    let sum = 0;
    for (let cursor = start; cursor < end; cursor += 1) sum += input[cursor];
    output[index] = sum / (end - start);
  }
  return output;
}

function pcm16Base64(float32) {
  const bytes = new Uint8Array(float32.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < float32.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, float32[index]));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

class PcmPlayer {
  constructor() {
    this.context = createAudioContext(24000);
    this.nextAt = 0;
    this.sources = new Set();
    this.onActivity = null;
  }

  async resume() {
    if (this.context.state === 'suspended') await this.context.resume();
  }

  play(base64) {
    try {
      const binary = atob(base64);
      const samples = new Float32Array(Math.floor(binary.length / 2));
      for (let index = 0; index < samples.length; index += 1) {
        let value = binary.charCodeAt(index * 2) | (binary.charCodeAt(index * 2 + 1) << 8);
        if (value >= 0x8000) value -= 0x10000;
        samples[index] = value / 0x8000;
      }
      const buffer = this.context.createBuffer(1, samples.length, 24000);
      buffer.copyToChannel(samples, 0);
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.context.destination);
      const startAt = Math.max(this.nextAt, this.context.currentTime + 0.02);
      source.start(startAt);
      this.nextAt = startAt + buffer.duration;
      this.sources.add(source);
      this.onActivity?.(true);
      source.onended = () => {
        this.sources.delete(source);
        if (!this.sources.size) this.onActivity?.(false);
      };
    } catch {
      // Skip a malformed frame.
    }
  }

  flush() {
    this.sources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    });
    this.sources.clear();
    this.nextAt = this.context.currentTime;
    this.onActivity?.(false);
  }

  close() {
    this.flush();
    this.context.close().catch(() => {});
  }
}

function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function CoachCall() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [muted, setMuted] = useState(false);
  const [partnerSpeaking, setPartnerSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [turns, setTurns] = useState([]);
  const [showCaptions, setShowCaptions] = useState(true);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [typed, setTyped] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [maxMs, setMaxMs] = useState(15 * 60 * 1000);

  const micBlock = microphoneBlockReason();
  const wsRef = useRef(null);
  const playerRef = useRef(null);
  const micRef = useRef(null);
  const mutedRef = useRef(false);
  const readyRef = useRef(false);
  const reconnectsRef = useRef(0);
  const endingRef = useRef(false);
  const startedAtRef = useRef(0);
  const wakeLockRef = useRef(null);
  const captionsRef = useRef(null);
  const finishCalledRef = useRef(false);

  useEffect(() => {
    coachApi.session(sessionId)
      .then((detail) => {
        if (detail.mode !== 'call') {
          navigate(`/coach/chat/${detail.id}`, { replace: true });
          return;
        }
        if (detail.status !== 'active') {
          navigate(`/coach/report/${detail.id}`, { replace: true });
          return;
        }
        setSession(detail);
      })
      .catch((loadError) => setError(loadError.message));
  }, [sessionId, navigate]);

  useEffect(() => {
    if (status !== 'live') return undefined;
    const timer = setInterval(() => setElapsed(Date.now() - startedAtRef.current), 500);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    captionsRef.current?.scrollTo({ top: captionsRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  const appendTurn = useCallback((role, text) => {
    setTurns((list) => {
      const last = list[list.length - 1];
      if (last && last.role === role && !last.closed) {
        return [...list.slice(0, -1), { ...last, text: last.text + text }];
      }
      return [...list.slice(-40), { role, text: text.trimStart() }];
    });
  }, []);

  const closeTurns = useCallback(() => {
    setTurns((list) => list.map((turn) => ({ ...turn, closed: true })));
  }, []);

  const releaseMedia = useCallback(() => {
    const mic = micRef.current;
    if (mic) {
      try {
        mic.processor.disconnect();
        mic.source.disconnect();
      } catch {
        // Ignore.
      }
      mic.stream.getTracks().forEach((track) => track.stop());
      mic.context.close().catch(() => {});
    }
    micRef.current = null;
    playerRef.current?.close();
    playerRef.current = null;
    wakeLockRef.current?.release?.().catch?.(() => {});
    wakeLockRef.current = null;
  }, []);

  useEffect(() => () => {
    endingRef.current = true;
    try {
      wsRef.current?.close();
    } catch {
      // Ignore.
    }
    releaseMedia();
  }, [releaseMedia]);

  const finishAndReport = useCallback(async () => {
    if (finishCalledRef.current) return;
    finishCalledRef.current = true;
    setStatus('ending');
    releaseMedia();
    try {
      await coachApi.finish(sessionId);
    } catch {
      // Report page shows the state and offers a retry.
    }
    navigate(`/coach/report/${sessionId}`, { replace: true });
  }, [navigate, releaseMedia, sessionId]);

  const connect = useCallback(() => {
    readyRef.current = false;
    const ws = new WebSocket(coachLiveUrl(sessionId));
    wsRef.current = ws;

    ws.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (message.type) {
        case 'ready':
          readyRef.current = true;
          reconnectsRef.current = 0;
          if (!startedAtRef.current) startedAtRef.current = Date.now();
          if (message.maxMs) setMaxMs(message.maxMs);
          setStatus('live');
          setError('');
          break;
        case 'audio':
          playerRef.current?.play(message.data);
          break;
        case 'user_transcript':
          appendTurn('user', message.text);
          break;
        case 'assistant_transcript':
          appendTurn('assistant', message.text);
          break;
        case 'interrupted':
          playerRef.current?.flush();
          closeTurns();
          break;
        case 'turn_complete':
          closeTurns();
          break;
        case 'warning':
          setWarning(message.message);
          setTimeout(() => setWarning(''), 6000);
          break;
        case 'ended':
          endingRef.current = true;
          finishAndReport();
          break;
        case 'error':
          setError(message.message);
          if (!message.reconnectable) {
            endingRef.current = true;
            setStatus('error');
          }
          break;
        default:
          break;
      }
    };

    ws.onclose = () => {
      readyRef.current = false;
      if (endingRef.current) return;
      if (reconnectsRef.current < MAX_RECONNECTS) {
        reconnectsRef.current += 1;
        setStatus('reconnecting');
        setTimeout(() => {
          if (!endingRef.current) connect();
        }, 800 * reconnectsRef.current);
      } else {
        setStatus('error');
        setError((current) => current || 'Связь прервалась. Можно завершить звонок и получить разбор того, что успели сказать.');
      }
    };
  }, [appendTurn, closeTurns, finishAndReport, sessionId]);

  const startCall = async () => {
    setError('');
    if (micBlock) return;
    setStatus('connecting');
    endingRef.current = false;
    let context = null;
    try {
      // iOS Safari only lets an AudioContext start inside the tap itself, so both
      // contexts are created and resumed before awaiting the microphone prompt.
      const player = new PcmPlayer();
      player.onActivity = setPartnerSpeaking;
      playerRef.current = player;
      context = createAudioContext(16000);
      const resumes = Promise.all([player.resume(), context.state === 'suspended' ? context.resume() : null]);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      await resumes;
      if (context.state === 'suspended') await context.resume();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silent = context.createGain();
      silent.gain.value = 0;
      source.connect(processor);
      processor.connect(silent);
      silent.connect(context.destination);
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        let peak = 0;
        for (let index = 0; index < input.length; index += 64) peak = Math.max(peak, Math.abs(input[index]));
        setMicLevel(mutedRef.current ? 0 : Math.min(1, peak * 2.5));
        const ws = wsRef.current;
        if (!readyRef.current || mutedRef.current || !ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: 'audio', data: pcm16Base64(downsampleTo16k(input, context.sampleRate)) }));
      };
      micRef.current = { stream, context, source, processor };

      try {
        wakeLockRef.current = await navigator.wakeLock?.request?.('screen');
      } catch {
        // Wake lock is optional.
      }
      connect();
    } catch (startError) {
      if (context && !micRef.current) context.close().catch(() => {});
      releaseMedia();
      setStatus('idle');
      const name = startError?.name || '';
      setError(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Нет доступа к микрофону. Разреши его в настройках браузера и попробуй снова.'
        : startError.message || 'Не удалось начать звонок.');
    }
  };

  const hangUp = () => {
    endingRef.current = true;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'end' }));
      // The server answers with 'ended' after saving the transcript; don't wait forever.
      setTimeout(finishAndReport, 2500);
      setStatus('ending');
    } else {
      finishAndReport();
    }
  };

  const toggleMute = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    micRef.current?.stream.getAudioTracks().forEach((track) => { track.enabled = !next; });
  };

  const sendTyped = () => {
    const text = typed.trim();
    const ws = wsRef.current;
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'text', text }));
    appendTurn('user', text);
    closeTurns();
    setTyped('');
  };

  const partner = session?.partner || { name: 'Lucía' };
  const remaining = maxMs - elapsed;
  const inCall = ['live', 'reconnecting', 'connecting'].includes(status);

  if (!session) {
    return (
      <CoachPage narrow>
        {error ? <ErrorNote message={error} /> : <div className="py-24 flex justify-center c-muted"><Spinner className="w-6 h-6" /></div>}
      </CoachPage>
    );
  }

  return (
    <CoachPage narrow>
      <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - 11.5rem - env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex items-center justify-between">
          {!inCall && status !== 'ending' ? (
            <Link to="/" className="c-muted hover:opacity-80 p-1 -ml-1" aria-label="На главную"><ArrowLeft className="w-5 h-5" /></Link>
          ) : <span />}
          <span className="text-xs c-muted">{session.scenario ? `${session.scenario.emoji} ${session.scenario.title_ru}` : `${session.topic?.emoji || '☕'} ${session.topic?.title_ru || ''}`}</span>
          <span className="font-mono text-sm c-muted w-12 text-right">{status === 'live' ? formatClock(elapsed) : ''}</span>
        </div>

        <div className="flex flex-col items-center text-center mt-6">
          <div className="relative">
            <PartnerAvatar name={partner.name} size={112} speaking={partnerSpeaking} />
          </div>
          <div className="text-2xl font-extrabold c-text mt-5">{partner.name}</div>
          <div className="text-sm c-muted mt-1 min-h-[1.25rem]">
            {status === 'idle' && (session.scenario ? session.scenario.goal_ru : partner.role_ru)}
            {status === 'connecting' && 'Соединяю…'}
            {status === 'reconnecting' && 'Связь прервалась, переподключаюсь…'}
            {status === 'live' && (partnerSpeaking ? 'говорит…' : muted ? 'микрофон выключен' : 'слушает тебя')}
            {status === 'ending' && 'Сохраняю разговор и готовлю разбор…'}
            {status === 'error' && 'Звонок прерван'}
          </div>
          {status === 'live' && remaining < 60_000 && <div className="text-xs c-warn mt-1">Осталось {formatClock(remaining)}</div>}
        </div>

        {status === 'idle' && (
          <div className="mt-8 space-y-3">
            <div className="c-panel rounded-2xl p-4 text-sm c-text space-y-2">
              <div className="flex gap-2.5"><Headphones className="w-4 h-4 c-accent flex-shrink-0 mt-0.5" /><span>С наушниками звучит лучше и Лусия не слышит саму себя.</span></div>
              <div className="flex gap-2.5"><Mic className="w-4 h-4 c-accent flex-shrink-0 mt-0.5" /><span>Говори свободно, перебивай, переспрашивай — как в обычном звонке. Ошибки не исправляются на ходу: всё будет в разборе после звонка.</span></div>
              <div className="flex gap-2.5"><Keyboard className="w-4 h-4 c-accent flex-shrink-0 mt-0.5" /><span>Если не знаешь слово — скажи его по-русски, Лусия подскажет.</span></div>
            </div>
            {session.scenario?.goal_ru && <div className="c-bg-accent rounded-xl px-4 py-2.5 text-sm"><b>Цель:</b> {session.scenario.goal_ru}</div>}
            {micBlock ? (
              <MicUnavailable reason={micBlock} />
            ) : (
              <button type="button" onClick={startCall} className="w-full py-4 rounded-2xl font-extrabold text-white text-lg inline-flex items-center justify-center gap-2.5 active:scale-[0.99] transition-transform" style={{ background: 'var(--c-good)' }}>
                <Phone className="w-5 h-5" /> Позвонить
              </button>
            )}
          </div>
        )}

        {warning && <div className="mt-4 c-bg-warn rounded-xl px-4 py-2 text-sm text-center">{warning}</div>}
        {error && <div className="mt-4"><ErrorNote message={error} /></div>}

        {(inCall || status === 'ending' || status === 'error') && showCaptions && turns.length > 0 && (
          <div ref={captionsRef} className="mt-6 flex-1 min-h-[120px] max-h-[34vh] overflow-y-auto space-y-2 px-1">
            {turns.map((turn, index) => (
              <div key={index} className={`text-[14px] leading-snug ${turn.role === 'user' ? 'text-right' : ''}`}>
                <span className={`inline-block rounded-xl px-3 py-1.5 max-w-[90%] ${turn.role === 'user' ? 'c-bubble-me' : 'c-bubble-them'}`}>{turn.text}</span>
              </div>
            ))}
          </div>
        )}

        {inCall && showKeyboard && (
          <div className="mt-3 c-card rounded-2xl p-2 flex items-center gap-2">
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && sendTyped()}
              placeholder="Написать вместо голоса…"
              className="flex-1 bg-transparent outline-none c-text px-2 py-2 text-[15px]"
              maxLength={1000}
            />
            <button type="button" onClick={sendTyped} className="w-10 h-10 rounded-xl c-btn-primary flex items-center justify-center"><Send className="w-4 h-4" /></button>
          </div>
        )}

        {(inCall || status === 'error') && (
          <div className="mt-auto pt-6 flex items-center justify-center gap-5">
            <button type="button" onClick={() => setShowCaptions((value) => !value)} className={`w-12 h-12 rounded-full flex items-center justify-center ${showCaptions ? 'c-bg-accent' : 'c-btn-ghost'}`} aria-label="Субтитры">
              <Captions className="w-5 h-5" />
            </button>
            <button type="button" onClick={toggleMute} disabled={status !== 'live'} className={`relative w-16 h-16 rounded-full flex items-center justify-center ${muted ? 'c-bg-bad' : 'c-btn-ghost'}`} aria-label={muted ? 'Включить микрофон' : 'Выключить микрофон'}>
              {!muted && <span className="absolute inset-0 rounded-full" style={{ boxShadow: `0 0 0 ${Math.round(micLevel * 10)}px var(--c-accent-soft)` }} />}
              {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>
            <button type="button" onClick={hangUp} className="w-16 h-16 rounded-full flex items-center justify-center text-white" style={{ background: '#dc2647' }} aria-label="Завершить звонок">
              <PhoneOff className="w-6 h-6" />
            </button>
            <button type="button" onClick={() => setShowKeyboard((value) => !value)} className={`w-12 h-12 rounded-full flex items-center justify-center ${showKeyboard ? 'c-bg-accent' : 'c-btn-ghost'}`} aria-label="Клавиатура">
              <Keyboard className="w-5 h-5" />
            </button>
          </div>
        )}

        {status === 'ending' && <div className="mt-auto pt-8 flex justify-center c-muted"><Spinner className="w-6 h-6" /></div>}
      </div>
    </CoachPage>
  );
}
