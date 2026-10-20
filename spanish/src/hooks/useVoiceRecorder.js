import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_RECORDING_MS = 150_000;
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

export function isVoiceRecordingSupported() {
  return typeof window !== 'undefined'
    && typeof MediaRecorder !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia);
}

function describeMicError(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Нет доступа к микрофону. Разрешите его в настройках браузера.';
  if (name === 'NotFoundError') return 'Микрофон не найден.';
  if (name === 'NotReadableError') return 'Микрофон занят другим приложением.';
  return 'Не удалось включить микрофон.';
}

/**
 * Tap-to-start / tap-to-stop voice recorder with a live input level.
 * stop() resolves to { blob, mimeType, durationMs } (or null if cancelled).
 */
export function useVoiceRecorder() {
  const [state, setState] = useState('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const resolveRef = useRef(null);
  const cancelledRef = useRef(false);
  const timerRef = useRef(null);
  const rafRef = useRef(null);
  const audioContextRef = useRef(null);

  const teardown = useCallback(() => {
    clearInterval(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => () => {
    cancelledRef.current = true;
    try {
      recorderRef.current?.state === 'recording' && recorderRef.current.stop();
    } catch {
      // Ignore.
    }
    teardown();
  }, [teardown]);

  const stop = useCallback(() => new Promise((resolve) => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') {
      resolve(null);
      return;
    }
    resolveRef.current = resolve;
    setState('processing');
    try {
      recorder.requestData?.();
    } catch {
      // Not all browsers support requestData.
    }
    recorder.stop();
  }), []);

  const start = useCallback(async () => {
    if (state === 'recording' || state === 'requesting') return false;
    setError('');
    if (!isVoiceRecordingSupported()) {
      setError('Этот браузер не умеет записывать голос.');
      return false;
    }
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 48_000 } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const durationMs = Date.now() - startedAtRef.current;
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        teardown();
        setState('idle');
        setElapsedMs(0);
        const resolve = resolveRef.current;
        resolveRef.current = null;
        if (resolve) resolve(cancelledRef.current ? null : { blob, mimeType: type.split(';')[0], durationMs });
      };

      try {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (AudioContextCtor) {
          const context = new AudioContextCtor();
          audioContextRef.current = context;
          const analyser = context.createAnalyser();
          analyser.fftSize = 512;
          context.createMediaStreamSource(stream).connect(analyser);
          const data = new Uint8Array(analyser.fftSize);
          const tick = () => {
            analyser.getByteTimeDomainData(data);
            let peak = 0;
            for (let index = 0; index < data.length; index += 1) peak = Math.max(peak, Math.abs(data[index] - 128));
            setLevel(Math.min(1, peak / 64));
            rafRef.current = requestAnimationFrame(tick);
          };
          tick();
        }
      } catch {
        // Level meter is cosmetic.
      }

      startedAtRef.current = Date.now();
      recorder.start(250);
      setState('recording');
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_RECORDING_MS) stop();
      }, 200);
      return true;
    } catch (micError) {
      teardown();
      setState('idle');
      setError(describeMicError(micError));
      return false;
    }
  }, [state, stop, teardown]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    } else {
      teardown();
      setState('idle');
    }
  }, [teardown]);

  return { state, isRecording: state === 'recording', elapsedMs, level, error, start, stop, cancel, clearError: () => setError('') };
}
