import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Loader2,
  Volume2,
  AlertCircle,
  Radio,
  Keyboard,
} from 'lucide-react';

const DEFAULT_SESSION_MS = 15 * 60 * 1000;
const MAX_RECONNECT_ATTEMPTS = 3;
const MAX_SERVER_AUDIO_CHARS = 64 * 1024;

function buildWsUrl(voice) {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const prefix = window.location.pathname.startsWith('/english')
    ? '/english/api/live-chat'
    : '/api/live-chat';
  const url = `${proto}://${window.location.host}${prefix}`;
  return voice ? `${url}?voice=${encodeURIComponent(voice)}` : url;
}

function createAudioContext(sampleRate) {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) throw new Error('Web Audio is not supported by this browser.');
  try {
    return new AudioContextConstructor({ sampleRate });
  } catch {
    return new AudioContextConstructor();
  }
}

async function setupMicStream() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  try {
    const audioContext = createAudioContext(16000);
    if (audioContext.state === 'suspended') await audioContext.resume();
    const source = audioContext.createMediaStreamSource(stream);
    // ScriptProcessor remains the broadest browser-compatible way to capture
    // raw frames without shipping a separate AudioWorklet asset.
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const silentOutput = audioContext.createGain();
    silentOutput.gain.value = 0;
    source.connect(processor);
    processor.connect(silentOutput);
    silentOutput.connect(audioContext.destination);
    return { stream, audioContext, source, processor, silentOutput };
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
}

function resampleTo16k(input, inputRate) {
  if (!inputRate || inputRate === 16000) return input;
  const ratio = inputRate / 16000;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.max(start + 1, Math.min(input.length, Math.floor((index + 1) * ratio)));
    let total = 0;
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
      total += input[sourceIndex];
    }
    output[index] = total / (end - start);
  }
  return output;
}

function floatTo16BitPCM(float32Array) {
  const out = new Int16Array(float32Array.length);
  for (let index = 0; index < float32Array.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, float32Array[index]));
    out[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

class AudioPlayer {
  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
    this.audioContext = null;
    this.queue = [];
    this.nextStartAt = 0;
    this.sources = new Set();
    this.alive = true;
    this.draining = false;
    this.epoch = 0;
  }

  async ensureContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = createAudioContext(this.sampleRate);
    }
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();
    return this.audioContext;
  }

  enqueue(base64Pcm) {
    if (!this.alive || typeof base64Pcm !== 'string' || base64Pcm.length > MAX_SERVER_AUDIO_CHARS) return;
    try {
      const binary = atob(base64Pcm);
      if (!binary.length || binary.length % 2 !== 0) return;
      const samples = new Float32Array(binary.length / 2);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const view = new DataView(bytes.buffer);
      for (let index = 0; index < samples.length; index += 1) {
        samples[index] = view.getInt16(index * 2, true) / 0x8000;
      }
      this.queue.push(samples);
      void this.drain();
    } catch {
      // Ignore a malformed frame; the following Live frame can still play.
    }
  }

  async drain() {
    if (this.draining || !this.alive) return;
    this.draining = true;
    const epoch = this.epoch;
    try {
      const context = await this.ensureContext();
      while (this.alive && epoch === this.epoch && this.queue.length) {
        const samples = this.queue.shift();
        const buffer = context.createBuffer(1, samples.length, this.sampleRate);
        buffer.copyToChannel(samples, 0);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        this.sources.add(source);
        source.onended = () => {
          this.sources.delete(source);
          try {
            source.disconnect();
          } catch {
            // Already disconnected.
          }
        };
        const startAt = Math.max(this.nextStartAt, context.currentTime);
        source.start(startAt);
        this.nextStartAt = startAt + buffer.duration;
      }
    } catch {
      // A context can close during teardown or interruption.
    } finally {
      this.draining = false;
      if (this.alive && this.queue.length) void this.drain();
    }
  }

  flush() {
    this.epoch += 1;
    this.queue = [];
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // The source may already have ended.
      }
    }
    this.sources.clear();
    this.nextStartAt = this.audioContext?.currentTime || 0;
  }

  async close() {
    this.alive = false;
    this.flush();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        await this.audioContext.close();
      } catch {
        // Already closed by the browser.
      }
    }
    this.audioContext = null;
  }
}

export default function VoiceChat({ voiceName, onExercise, onTopicChange, onVocabAdded }) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [liveTranscript, setLiveTranscript] = useState({ user: '', assistant: '' });
  const [transcriptHistory, setTranscriptHistory] = useState([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [typedInput, setTypedInput] = useState('');

  const mountedRef = useRef(true);
  const desiredActiveRef = useRef(false);
  const statusRef = useRef('idle');
  const mutedRef = useRef(false);
  const wsRef = useRef(null);
  const micRef = useRef(null);
  const playerRef = useRef(null);
  const timerRef = useRef(null);
  const stableTimerRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const sessionStartRef = useRef(0);
  const maxSessionMsRef = useRef(DEFAULT_SESSION_MS);
  const connectionSequenceRef = useRef(0);
  const startSequenceRef = useRef(0);
  const reconnectAttemptsRef = useRef(0);
  const lastEndReasonRef = useRef('');
  const sessionReadyRef = useRef(false);
  const userTranscriptBufferRef = useRef('');
  const userInterimBufferRef = useRef('');
  const assistantTranscriptBufferRef = useRef('');
  const callbacksRef = useRef({ onExercise, onTopicChange, onVocabAdded });
  const connectSocketRef = useRef(null);

  useEffect(() => {
    callbacksRef.current = { onExercise, onTopicChange, onVocabAdded };
  }, [onExercise, onTopicChange, onVocabAdded]);

  const updateStatus = useCallback((nextStatus) => {
    statusRef.current = nextStatus;
    if (mountedRef.current) setStatus(nextStatus);
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    timerRef.current = null;
    stableTimerRef.current = null;
    reconnectTimerRef.current = null;
  }, []);

  const cleanupMic = useCallback((mic = micRef.current) => {
    if (!mic) return;
    mic.processor.onaudioprocess = null;
    for (const node of [mic.processor, mic.source, mic.silentOutput]) {
      try {
        node.disconnect();
      } catch {
        // The node may already be disconnected.
      }
    }
    mic.stream.getTracks().forEach((track) => track.stop());
    if (mic.audioContext.state !== 'closed') void mic.audioContext.close().catch(() => {});
    if (micRef.current === mic) micRef.current = null;
  }, []);

  const closeCurrentSocket = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    sessionReadyRef.current = false;
    if (!ws) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    try {
      ws.close(1000, 'client_cleanup');
    } catch {
      // Socket was already closed.
    }
  }, []);

  const resetTranscriptBuffers = useCallback(() => {
    userTranscriptBufferRef.current = '';
    userInterimBufferRef.current = '';
    assistantTranscriptBufferRef.current = '';
    if (mountedRef.current) setLiveTranscript({ user: '', assistant: '' });
  }, []);

  const releaseMedia = useCallback(() => {
    cleanupMic();
    if (playerRef.current) {
      void playerRef.current.close();
      playerRef.current = null;
    }
  }, [cleanupMic]);

  const teardown = useCallback(
    (finalStatus = 'idle', shouldUpdateState = true) => {
      desiredActiveRef.current = false;
      startSequenceRef.current += 1;
      connectionSequenceRef.current += 1;
      clearTimers();
      closeCurrentSocket();
      releaseMedia();
      resetTranscriptBuffers();
      if (shouldUpdateState && mountedRef.current) updateStatus(finalStatus);
    },
    [clearTimers, closeCurrentSocket, releaseMedia, resetTranscriptBuffers, updateStatus],
  );

  const commitTranscriptTurn = useCallback(() => {
    const userText = `${userTranscriptBufferRef.current}${userInterimBufferRef.current}`.trim();
    const assistantText = assistantTranscriptBufferRef.current.trim();
    if (userText || assistantText) {
      const timestamp = Date.now();
      const additions = [];
      if (userText) additions.push({ id: `${timestamp}-user`, role: 'user', text: userText });
      if (assistantText) additions.push({ id: `${timestamp}-assistant`, role: 'assistant', text: assistantText });
      if (mountedRef.current) {
        setTranscriptHistory((previous) => [...previous, ...additions].slice(-30));
      }
    }
    resetTranscriptBuffers();
  }, [resetTranscriptBuffers]);

  const refreshUserTranscript = useCallback(() => {
    if (!mountedRef.current) return;
    setLiveTranscript((previous) => ({
      ...previous,
      user: `${userTranscriptBufferRef.current}${userInterimBufferRef.current}`,
    }));
  }, []);

  const refreshAssistantTranscript = useCallback(() => {
    if (!mountedRef.current) return;
    setLiveTranscript((previous) => ({
      ...previous,
      assistant: assistantTranscriptBufferRef.current,
    }));
  }, []);

  const scheduleReconnect = useCallback(
    (reason = 'connection_lost') => {
      if (!mountedRef.current || !desiredActiveRef.current) return;
      clearTimers();
      playerRef.current?.flush();
      commitTranscriptTurn();

      if (reason === 'session_limit') reconnectAttemptsRef.current = 0;
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        desiredActiveRef.current = false;
        releaseMedia();
        setError('The live connection could not be restored. Check your network and try again.');
        updateStatus('ended');
        return;
      }

      reconnectAttemptsRef.current += 1;
      updateStatus('reconnecting');
      const delay = reason === 'session_limit'
        ? 250
        : Math.min(4000, 500 * 2 ** (reconnectAttemptsRef.current - 1));
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        if (desiredActiveRef.current) connectSocketRef.current?.();
      }, delay);
    },
    [clearTimers, commitTranscriptTurn, releaseMedia, updateStatus],
  );

  const handleServerMessage = useCallback(
    (event, connectionId) => {
      if (connectionId !== connectionSequenceRef.current) return;
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!data || typeof data.type !== 'string') return;

      switch (data.type) {
        case 'session_ready': {
          const serverLimit = Number(data.maxSessionMs);
          maxSessionMsRef.current = Number.isFinite(serverLimit) && serverLimit >= 1000
            ? Math.min(serverLimit, 30 * 60 * 1000)
            : DEFAULT_SESSION_MS;
          sessionReadyRef.current = true;
          lastEndReasonRef.current = '';
          setError(null);
          updateStatus('live');
          sessionStartRef.current = Date.now();
          setElapsedMs(0);
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = setInterval(() => {
            const elapsed = Date.now() - sessionStartRef.current;
            if (mountedRef.current) setElapsedMs(elapsed);
            // The bridge enforces the same cap. This is a fallback if its close
            // frame gets lost: roll to a fresh Live session without recapturing
            // the microphone.
            if (elapsed > maxSessionMsRef.current + 2000) {
              lastEndReasonRef.current = 'session_limit';
              const ws = wsRef.current;
              if (ws) ws.close(1000, 'session_limit_rollover');
            }
          }, 500);
          stableTimerRef.current = setTimeout(() => {
            reconnectAttemptsRef.current = 0;
          }, 30000);
          break;
        }

        case 'audio':
          if (typeof data.data === 'string') playerRef.current?.enqueue(data.data);
          break;

        case 'interrupted':
          playerRef.current?.flush();
          assistantTranscriptBufferRef.current = '';
          refreshAssistantTranscript();
          break;

        case 'user_transcript':
          if (typeof data.text !== 'string') break;
          if (data.interim) {
            userInterimBufferRef.current = data.text;
          } else {
            userTranscriptBufferRef.current = (
              userTranscriptBufferRef.current + data.text
            ).slice(0, 4000);
            userInterimBufferRef.current = '';
          }
          refreshUserTranscript();
          break;

        case 'assistant_transcript':
          if (typeof data.text !== 'string') break;
          assistantTranscriptBufferRef.current = (
            assistantTranscriptBufferRef.current + data.text
          ).slice(0, 8000);
          refreshAssistantTranscript();
          break;

        case 'turn_complete':
          commitTranscriptTurn();
          break;

        case 'topic_change':
          callbacksRef.current.onTopicChange?.(data.change);
          break;

        case 'vocab_added':
          callbacksRef.current.onVocabAdded?.(data.entry);
          break;

        case 'exercise':
          callbacksRef.current.onExercise?.(data.exercise);
          break;

        case 'session_ended':
          lastEndReasonRef.current = data.reason || 'session_ended';
          sessionReadyRef.current = false;
          if (data.reason !== 'session_limit') {
            setError('The live session ended. Reconnecting…');
          }
          updateStatus('reconnecting');
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.close(1000, 'server_session_ended');
          }
          break;

        case 'error':
          lastEndReasonRef.current = data.code || 'server_error';
          setError(data.message || 'Voice session error.');
          break;

        default:
          break;
      }
    },
    [commitTranscriptTurn, refreshAssistantTranscript, refreshUserTranscript, updateStatus],
  );

  const connectSocket = useCallback(() => {
    if (!mountedRef.current || !desiredActiveRef.current || !micRef.current) return;
    closeCurrentSocket();
    sessionReadyRef.current = false;
    const connectionId = connectionSequenceRef.current + 1;
    connectionSequenceRef.current = connectionId;
    updateStatus(reconnectAttemptsRef.current ? 'reconnecting' : 'connecting');

    let ws;
    try {
      ws = new WebSocket(buildWsUrl(voiceName));
    } catch {
      scheduleReconnect('socket_creation_failed');
      return;
    }
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    // Attach all handlers immediately. A fast session_ready frame must not
    // race a React state transition/effect subscription.
    ws.onmessage = (event) => handleServerMessage(event, connectionId);
    ws.onopen = () => {};
    ws.onerror = () => {};
    ws.onclose = () => {
      if (connectionId !== connectionSequenceRef.current) return;
      wsRef.current = null;
      sessionReadyRef.current = false;
      const reason = lastEndReasonRef.current || 'connection_lost';
      lastEndReasonRef.current = '';
      scheduleReconnect(reason);
    };
  }, [closeCurrentSocket, handleServerMessage, scheduleReconnect, updateStatus, voiceName]);

  useEffect(() => {
    connectSocketRef.current = connectSocket;
  }, [connectSocket]);

  const startSession = useCallback(async () => {
    if (desiredActiveRef.current) return;
    desiredActiveRef.current = true;
    reconnectAttemptsRef.current = 0;
    lastEndReasonRef.current = '';
    mutedRef.current = false;
    setMuted(false);
    const startId = startSequenceRef.current + 1;
    startSequenceRef.current = startId;
    setError(null);
    setTranscriptHistory([]);
    resetTranscriptBuffers();
    updateStatus('connecting');

    let mic;
    let player;
    try {
      mic = await setupMicStream();
      if (!mountedRef.current || !desiredActiveRef.current || startId !== startSequenceRef.current) {
        cleanupMic(mic);
        return;
      }
      micRef.current = mic;

      player = new AudioPlayer(24000);
      await player.ensureContext();
      if (!mountedRef.current || !desiredActiveRef.current || startId !== startSequenceRef.current) {
        await player.close();
        cleanupMic(mic);
        return;
      }
      playerRef.current = player;

      mic.processor.onaudioprocess = (audioEvent) => {
        if (mutedRef.current || !desiredActiveRef.current || !sessionReadyRef.current) return;
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        try {
          const input = audioEvent.inputBuffer.getChannelData(0);
          const resampled = resampleTo16k(input, mic.audioContext.sampleRate);
          const pcm = floatTo16BitPCM(resampled);
          ws.send(JSON.stringify({
            type: 'audio_chunk',
            data: bytesToBase64(new Uint8Array(pcm.buffer)),
          }));
        } catch {
          // A frame can race teardown; the next frame/session remains usable.
        }
      };

      connectSocketRef.current?.();
    } catch (caughtError) {
      desiredActiveRef.current = false;
      if (mic) cleanupMic(mic);
      if (player) await player.close();
      if (!mountedRef.current) return;
      const isPermission =
        caughtError?.name === 'NotAllowedError' ||
        /permission|denied|notallowed/i.test(caughtError?.message || '');
      setError(
        isPermission
          ? 'Microphone access was blocked. Allow it in your browser and try again.'
          : caughtError?.message || 'Failed to start voice session.',
      );
      updateStatus('error');
    }
  }, [cleanupMic, resetTranscriptBuffers, updateStatus]);

  const stopSession = useCallback(() => {
    setError(null);
    teardown('idle');
  }, [teardown]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    micRef.current?.stream.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
  }, []);

  const sendTyped = useCallback(() => {
    const text = typedInput.trim();
    const ws = wsRef.current;
    if (!text || statusRef.current !== 'live' || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'text', text: text.slice(0, 2000) }));
    userTranscriptBufferRef.current += `${userTranscriptBufferRef.current ? ' ' : ''}${text.slice(0, 2000)}`;
    refreshUserTranscript();
    setTypedInput('');
  }, [refreshUserTranscript, typedInput]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      teardown('idle', false);
    };
  }, [teardown]);

  const mins = Math.floor(elapsedMs / 60000);
  const secs = Math.floor((elapsedMs % 60000) / 1000);
  const remainingMs = Math.max(0, maxSessionMsRef.current - elapsedMs);
  const remainingMin = Math.ceil(remainingMs / 60000);
  const active = status === 'connecting' || status === 'reconnecting' || status === 'live';

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-2xl overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Radio className={`h-5 w-5 ${status === 'live' ? 'animate-pulse' : ''}`} />
          <div>
            <h2 className="text-lg font-semibold">Voice Chat</h2>
            <p className="text-xs text-white/80">
              {status === 'live'
                ? `Live · ${mins}:${String(secs).padStart(2, '0')} (~${remainingMin}m left)`
                : status === 'reconnecting'
                  ? 'Restoring live connection…'
                  : status === 'connecting'
                    ? 'Connecting…'
                    : status === 'ended'
                      ? 'Session ended'
                      : status === 'error'
                        ? 'Error'
                        : 'Gemini Live API · realtime voice'}
            </p>
          </div>
        </div>
        {active && (
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleMute}
              className={`p-2 rounded-lg transition-all ${muted ? 'bg-red-500 hover:bg-red-600' : 'bg-white/20 hover:bg-white/30'}`}
              aria-label={muted ? 'Unmute mic' : 'Mute mic'}
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <button
              onClick={stopSession}
              className="flex items-center space-x-1 bg-red-500 hover:bg-red-600 px-3 py-2 rounded-lg text-sm transition-all"
              title="End session"
            >
              <PhoneOff className="h-4 w-4" />
              <span>End</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 flex items-start space-x-2">
            <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm">Voice session problem</p>
              <p className="text-xs mt-1">{error}</p>
            </div>
          </div>
        )}

        {status === 'idle' && !error && (
          <div className="text-center py-12 space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full">
              <Mic className="h-10 w-10 text-indigo-500" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-gray-800">Practice English by voice</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                A continuous spoken conversation with realtime audio, transcripts, topic progress,
                vocabulary and exercises.
              </p>
            </div>
            <button
              onClick={startSession}
              className="inline-flex items-center space-x-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-6 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all"
            >
              <Phone className="h-5 w-5" />
              <span>Start voice chat</span>
            </button>
            <p className="text-xs text-gray-400">
              The connection rolls over automatically near the Live API session limit.
            </p>
          </div>
        )}

        {(status === 'connecting' || status === 'reconnecting') && !transcriptHistory.length && (
          <div className="text-center py-12 space-y-3">
            <Loader2 className="h-10 w-10 text-indigo-500 animate-spin mx-auto" />
            <p className="text-sm text-gray-600">
              {status === 'reconnecting' ? 'Restoring Gemini Live…' : 'Connecting to Gemini Live…'}
            </p>
          </div>
        )}

        {transcriptHistory.map((entry) => (
          <div key={entry.id} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`${entry.role === 'user' ? 'bg-indigo-100 text-indigo-900 rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'} rounded-2xl px-4 py-2 max-w-[80%]`}
            >
              <p className={`text-xs mb-0.5 ${entry.role === 'user' ? 'text-indigo-500' : 'text-gray-500'}`}>
                {entry.role === 'user' ? 'You' : 'Tutor'}
              </p>
              <p className="text-sm">{entry.text}</p>
            </div>
          </div>
        ))}

        {liveTranscript.user && (
          <div className="flex justify-end">
            <div className="bg-indigo-100 text-indigo-900 rounded-2xl rounded-tr-sm px-4 py-2 max-w-[80%]">
              <p className="text-xs text-indigo-500 mb-0.5">You (live)</p>
              <p className="text-sm">{liveTranscript.user}</p>
            </div>
          </div>
        )}
        {liveTranscript.assistant && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-800 rounded-2xl rounded-tl-sm px-4 py-2 max-w-[80%]">
              <p className="text-xs text-gray-500 mb-0.5 flex items-center space-x-1">
                <Volume2 className="h-3 w-3" />
                <span>Tutor (live)</span>
              </p>
              <p className="text-sm">{liveTranscript.assistant}</p>
            </div>
          </div>
        )}

        {status === 'live' && !liveTranscript.user && !liveTranscript.assistant && (
          <p className="text-center text-sm text-gray-400 mt-8">
            Listening… just start speaking in English.
          </p>
        )}

        {(status === 'ended' || status === 'error') && (
          <div className="text-center py-6">
            <button
              onClick={startSession}
              className="inline-flex items-center space-x-2 bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2.5 rounded-xl transition-all"
            >
              <Phone className="h-4 w-4" />
              <span>Reconnect</span>
            </button>
          </div>
        )}
      </div>

      {status === 'live' && (
        <div className="border-t bg-gray-50 px-4 py-3">
          <div className="flex items-center space-x-2">
            <Keyboard className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <input
              value={typedInput}
              maxLength={2000}
              onChange={(event) => setTypedInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  sendTyped();
                }
              }}
              placeholder="Or type a quick answer…"
              className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <button
              onClick={sendTyped}
              disabled={!typedInput.trim()}
              className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white text-sm px-3 py-2 rounded-lg transition-all"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
