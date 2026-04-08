import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  chooseSupportedRecordingMimeType,
  getRecordingStartAvailability,
  getLocalSpanishPlaybackSupport,
  getRecordingErrorMessage,
  getSpeechPlaybackAvailability,
  getVoicePracticeCapabilities,
  isExpectedSpeechSynthesisError,
  shouldAbortRecordingStart,
  shouldStoreCompletedRecording,
  selectBestSpanishVoice,
} from '../utils/speechPractice';

export function useSpeechPractice() {
  const [voices, setVoices] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsError, setTtsError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingStarting, setIsRecordingStarting] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState('');
  const [recordingError, setRecordingError] = useState('');
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recordingUrlRef = useRef('');
  const recordingChunksRef = useRef([]);
  const playbackAudioRef = useRef(null);
  const discardNextRecordingRef = useRef(false);
  const isMountedRef = useRef(true);
  const isRecordingRef = useRef(false);
  const recordingStartInFlightRef = useRef(false);
  const recordingStartRequestIdRef = useRef(0);
  const speechRequestIdRef = useRef(0);
  const activeUtteranceRef = useRef(null);

  const capabilities = useMemo(
    () => getVoicePracticeCapabilities({
      speechSynthesis: typeof window !== 'undefined' ? window.speechSynthesis : undefined,
      SpeechSynthesisUtterance: typeof window !== 'undefined' ? window.SpeechSynthesisUtterance : undefined,
      MediaRecorder: typeof window !== 'undefined' ? window.MediaRecorder : undefined,
      mediaDevices: typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined,
    }),
    [],
  );

  const selectedVoice = useMemo(() => selectBestSpanishVoice(voices), [voices]);
  const playbackSupport = useMemo(
    () => getLocalSpanishPlaybackSupport({
      ttsSupported: capabilities.ttsSupported,
      selectedVoice,
    }),
    [capabilities.ttsSupported, selectedVoice],
  );

  const stopSpeaking = useCallback(() => {
    if (!capabilities.ttsSupported || typeof window === 'undefined') {
      return;
    }

    speechRequestIdRef.current += 1;
    activeUtteranceRef.current = null;
    window.speechSynthesis.cancel();
    if (isMountedRef.current) {
      setIsSpeaking(false);
    }
  }, [capabilities.ttsSupported]);

  const setRecordingActive = useCallback((nextValue) => {
    isRecordingRef.current = nextValue;
    if (isMountedRef.current) {
      setIsRecording(nextValue);
    }
  }, []);

  const setRecordingStartingActive = useCallback((nextValue) => {
    recordingStartInFlightRef.current = nextValue;
    if (isMountedRef.current) {
      setIsRecordingStarting(nextValue);
    }
  }, []);

  const stopStreamTracks = useCallback((stream) => {
    stream?.getTracks?.().forEach((track) => {
      try {
        track.stop();
      } catch {
        // Ignore track stop failures during teardown.
      }
    });
  }, []);

  const stopMediaStream = useCallback(() => {
    stopStreamTracks(mediaStreamRef.current);
    mediaStreamRef.current = null;
  }, [stopStreamTracks]);

  const stopPlayback = useCallback(() => {
    if (!playbackAudioRef.current) {
      return;
    }

    playbackAudioRef.current.pause();
    playbackAudioRef.current.currentTime = 0;
    playbackAudioRef.current = null;
  }, []);

  const clearRecording = useCallback(() => {
    stopPlayback();

    if (recordingUrlRef.current && typeof URL !== 'undefined') {
      URL.revokeObjectURL(recordingUrlRef.current);
    }

    recordingUrlRef.current = '';
    recordingChunksRef.current = [];
    setRecordingUrl('');
    setRecordingError('');
  }, [stopPlayback]);

  const speakText = useCallback((text) => {
    const availability = getSpeechPlaybackAvailability({
      text,
      ttsSupported: capabilities.ttsSupported,
      selectedVoice,
      isRecording: isRecordingRef.current,
      isStarting: recordingStartInFlightRef.current,
      recorderState: mediaRecorderRef.current?.state,
    });

    if (!availability.allowed) {
      if (availability.message) {
        setTtsError(availability.message);
      }
      return false;
    }

    if (typeof window === 'undefined') {
      setTtsError('Spanish playback is not supported in this browser.');
      return false;
    }

    setTtsError('');
    const synth = window.speechSynthesis;
    const speechRequestId = speechRequestIdRef.current + 1;
    speechRequestIdRef.current = speechRequestId;
    activeUtteranceRef.current = null;
    synth.cancel();

    const utterance = new window.SpeechSynthesisUtterance(availability.text);
    utterance.lang = selectedVoice?.lang || 'es-ES';
    utterance.rate = 0.95;
    utterance.pitch = 1;

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onend = () => {
      if (speechRequestIdRef.current !== speechRequestId || activeUtteranceRef.current !== utterance) {
        return;
      }

      activeUtteranceRef.current = null;
      if (isMountedRef.current) {
        setIsSpeaking(false);
      }
    };

    utterance.onerror = (event) => {
      if (speechRequestIdRef.current !== speechRequestId || activeUtteranceRef.current !== utterance) {
        return;
      }

      activeUtteranceRef.current = null;
      if (isMountedRef.current) {
        setIsSpeaking(false);
        if (!isExpectedSpeechSynthesisError(event)) {
          setTtsError('Spanish playback could not start in this browser.');
        }
      }
    };

    activeUtteranceRef.current = utterance;
    if (isMountedRef.current) {
      setIsSpeaking(true);
    }
    synth.speak(utterance);
    return true;
  }, [capabilities.ttsSupported, selectedVoice]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recordingStartInFlightRef.current) {
      recordingStartRequestIdRef.current += 1;
      setRecordingStartingActive(false);
      stopMediaStream();
    }

    if (!recorder || recorder.state === 'inactive') {
      setRecordingActive(false);
      return;
    }

    recorder.stop();
  }, [setRecordingActive, setRecordingStartingActive, stopMediaStream]);

  const startRecording = useCallback(async () => {
    const availability = getRecordingStartAvailability({
      recordingSupported: capabilities.recordingSupported,
      hasWindow: typeof window !== 'undefined',
      hasNavigator: typeof navigator !== 'undefined',
      isRecording: isRecordingRef.current,
      isStarting: recordingStartInFlightRef.current,
    });
    if (!availability.allowed) {
      if (availability.message) {
        setRecordingError(availability.message);
      }
      return availability.busy;
    }

    const startRequestId = recordingStartRequestIdRef.current + 1;
    recordingStartRequestIdRef.current = startRequestId;
    setRecordingStartingActive(true);
    setRecordingError('');
    stopSpeaking();
    stopPlayback();
    discardNextRecordingRef.current = false;

    let stream = null;
    let recorder = null;
    const startWasCancelled = () => shouldAbortRecordingStart({
      isMounted: isMountedRef.current,
      startRequestId,
      activeStartRequestId: recordingStartRequestIdRef.current,
    });
    const stopDetachedRecorder = () => {
      if (!recorder) {
        return;
      }

      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;

      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          // Ignore stop failures when tearing down a detached recorder.
        }
      }
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (startWasCancelled()) {
        stopStreamTracks(stream);
        return false;
      }

      recordingChunksRef.current = [];

      const mimeType = chooseSupportedRecordingMimeType(window.MediaRecorder?.isTypeSupported?.bind(window.MediaRecorder));
      recorder = mimeType
        ? new window.MediaRecorder(stream, { mimeType })
        : new window.MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        if (mediaRecorderRef.current === recorder) {
          mediaRecorderRef.current = null;
        }
        recordingChunksRef.current = [];
        if (mediaStreamRef.current === stream) {
          mediaStreamRef.current = null;
        }
        stopStreamTracks(stream);
        setRecordingActive(false);
        if (isMountedRef.current) {
          setRecordingError('Recording stopped unexpectedly.');
        }
      };

      recorder.onstop = () => {
        const nextMimeType = recorder.mimeType || mimeType || 'audio/webm';
        const chunkCount = recordingChunksRef.current.length;
        const shouldDiscard = discardNextRecordingRef.current;
        discardNextRecordingRef.current = false;
        if (mediaRecorderRef.current === recorder) {
          mediaRecorderRef.current = null;
        }
        if (mediaStreamRef.current === stream) {
          mediaStreamRef.current = null;
        }
        stopStreamTracks(stream);
        setRecordingActive(false);

        if (!shouldStoreCompletedRecording({
          chunkCount,
          shouldDiscard,
          isMounted: isMountedRef.current,
          hasUrlSupport: typeof URL !== 'undefined',
        })) {
          recordingChunksRef.current = [];
          return;
        }

        if (recordingUrlRef.current) {
          URL.revokeObjectURL(recordingUrlRef.current);
        }

        const nextBlob = new Blob(recordingChunksRef.current, { type: nextMimeType });
        const nextUrl = URL.createObjectURL(nextBlob);
        recordingChunksRef.current = [];
        recordingUrlRef.current = nextUrl;
        if (isMountedRef.current) {
          setRecordingUrl(nextUrl);
        }
      };

      if (startWasCancelled()) {
        stopDetachedRecorder();
        stopStreamTracks(stream);
        return false;
      }

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recorder.start();
      clearRecording();
      setRecordingStartingActive(false);
      setRecordingActive(true);
      return true;
    } catch (error) {
      if (mediaRecorderRef.current === recorder) {
        mediaRecorderRef.current = null;
      }
      if (mediaStreamRef.current === stream) {
        mediaStreamRef.current = null;
      }
      stopDetachedRecorder();
      stopStreamTracks(stream);
      setRecordingActive(false);
      if (isMountedRef.current) {
        setRecordingError(getRecordingErrorMessage(error));
      }
      return false;
    } finally {
      if (recordingStartRequestIdRef.current === startRequestId) {
        setRecordingStartingActive(false);
      }
    }
  }, [
    capabilities.recordingSupported,
    clearRecording,
    setRecordingActive,
    setRecordingStartingActive,
    stopPlayback,
    stopSpeaking,
    stopStreamTracks,
  ]);

  const playRecording = useCallback(async () => {
    if (!recordingUrl || typeof Audio === 'undefined') {
      return false;
    }

    setRecordingError('');
    stopPlayback();

    const audio = new Audio(recordingUrl);
    playbackAudioRef.current = audio;
    audio.onended = () => {
      if (playbackAudioRef.current === audio) {
        playbackAudioRef.current = null;
      }
    };

    try {
      await audio.play();
      return true;
    } catch (error) {
      if (isMountedRef.current) {
        setRecordingError(error?.message || 'Your local recording could not be played back.');
      }
      playbackAudioRef.current = null;
      return false;
    }
  }, [recordingUrl, stopPlayback]);

  const resetPractice = useCallback(() => {
    discardNextRecordingRef.current = true;
    stopSpeaking();
    stopRecording();
    clearRecording();
    setTtsError('');
  }, [clearRecording, stopRecording, stopSpeaking]);

  useEffect(() => {
    if (!capabilities.ttsSupported || typeof window === 'undefined') {
      return undefined;
    }

    const synth = window.speechSynthesis;
    const updateVoices = () => {
      if (isMountedRef.current) {
        setVoices(synth.getVoices?.() || []);
      }
    };
    const previousHandler = synth.onvoiceschanged;

    updateVoices();
    synth.addEventListener?.('voiceschanged', updateVoices);
    synth.onvoiceschanged = updateVoices;

    return () => {
      synth.removeEventListener?.('voiceschanged', updateVoices);
      if (synth.onvoiceschanged === updateVoices) {
        synth.onvoiceschanged = previousHandler || null;
      }
    };
  }, [capabilities.ttsSupported]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      discardNextRecordingRef.current = true;
      stopSpeaking();
      stopRecording();
      stopMediaStream();
      stopPlayback();

      if (recordingUrlRef.current && typeof URL !== 'undefined') {
        URL.revokeObjectURL(recordingUrlRef.current);
      }

      recordingUrlRef.current = '';
      recordingChunksRef.current = [];
      mediaRecorderRef.current = null;
      isRecordingRef.current = false;
    };
  }, [stopMediaStream, stopPlayback, stopRecording, stopSpeaking]);

  return {
    capabilities,
    selectedVoice,
    playbackSupport,
    isSpeaking,
    ttsError,
    speakText,
    stopSpeaking,
    clearTtsError: () => setTtsError(''),
    isRecording,
    isRecordingStarting,
    hasRecording: Boolean(recordingUrl),
    recordingUrl,
    recordingError,
    startRecording,
    stopRecording,
    playRecording,
    clearRecording,
    clearRecordingError: () => setRecordingError(''),
    resetPractice,
  };
}
