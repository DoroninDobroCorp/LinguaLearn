export const SPANISH_VOICE_LOCALES = [
  'es-ES',
  'es-MX',
  'es-US',
  'es-419',
  'es-AR',
  'es-CO',
  'es-CL',
  'es-PE',
];

export const RECORDING_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

export function normalizeLangTag(value = '') {
  return String(value).trim().replaceAll('_', '-').toLowerCase();
}

export function isSpanishLang(value = '') {
  return normalizeLangTag(value).startsWith('es');
}

export function isLocalSpanishVoice(voice) {
  return Boolean(voice?.localService) && isSpanishLang(voice?.lang);
}

export function selectBestSpanishVoice(voices = [], preferredLocales = SPANISH_VOICE_LOCALES) {
  const localeScores = new Map(
    preferredLocales.map((locale, index) => [normalizeLangTag(locale), preferredLocales.length - index]),
  );

  let bestVoice = null;
  let bestScore = -1;

  voices.forEach((voice, index) => {
    if (!isLocalSpanishVoice(voice)) {
      return;
    }

    const normalizedLang = normalizeLangTag(voice?.lang);
    const normalizedName = String(voice?.name || '').toLowerCase();
    let score = localeScores.get(normalizedLang) || 1;

    if (normalizedName.includes('spanish') || normalizedName.includes('españ')) {
      score += 3;
    }

    if (voice?.default) {
      score += 1;
    }

    score -= index / 1000;

    if (score > bestScore) {
      bestScore = score;
      bestVoice = voice;
    }
  });

  return bestVoice;
}

export function getLocalSpanishPlaybackSupport({
  ttsSupported,
  selectedVoice,
}) {
  if (!ttsSupported) {
    return {
      supported: false,
      message: 'Spanish playback is not supported in this browser.',
      reason: 'unsupported-browser',
    };
  }

  if (!isLocalSpanishVoice(selectedVoice)) {
    return {
      supported: false,
      message: 'Spanish playback needs a local Spanish voice installed in this browser.',
      reason: 'missing-local-spanish-voice',
    };
  }

  return {
    supported: true,
    message: '',
    reason: 'ready',
  };
}

export function chooseSupportedRecordingMimeType(
  isTypeSupported,
  candidates = RECORDING_MIME_CANDIDATES,
) {
  if (typeof isTypeSupported !== 'function') {
    return '';
  }

  for (const candidate of candidates) {
    try {
      if (isTypeSupported(candidate)) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return '';
}

export function isMediaRecorderStateActive(state = '') {
  return state === 'recording' || state === 'paused';
}

export function getRecordingStartAvailability({
  recordingSupported,
  hasWindow = true,
  hasNavigator = true,
  isRecording = false,
  isStarting = false,
}) {
  if (!recordingSupported || !hasWindow || !hasNavigator) {
    return {
      allowed: false,
      busy: false,
      message: 'Microphone recording is not supported in this browser.',
      reason: 'unsupported-browser',
    };
  }

  if (isStarting) {
    return {
      allowed: false,
      busy: true,
      message: '',
      reason: 'starting',
    };
  }

  if (isRecording) {
    return {
      allowed: false,
      busy: true,
      message: '',
      reason: 'recording',
    };
  }

  return {
    allowed: true,
    busy: false,
    message: '',
    reason: 'ready',
  };
}

export function shouldAbortRecordingStart({
  isMounted = true,
  startRequestId = 0,
  activeStartRequestId = 0,
}) {
  return !isMounted || startRequestId !== activeStartRequestId;
}

export function getSpeechPlaybackAvailability({
  text,
  ttsSupported,
  selectedVoice,
  isRecording = false,
  isStarting = false,
  recorderState = '',
}) {
  const trimmedText = String(text || '').trim();
  if (!trimmedText) {
    return {
      allowed: false,
      message: '',
      reason: 'empty',
      text: '',
    };
  }

  const playbackSupport = getLocalSpanishPlaybackSupport({
    ttsSupported,
    selectedVoice,
  });

  if (!playbackSupport.supported) {
    return {
      allowed: false,
      message: playbackSupport.message,
      reason: playbackSupport.reason,
      text: trimmedText,
    };
  }

  if (isStarting) {
    return {
      allowed: false,
      message: 'Wait for microphone setup to finish before listening in Spanish.',
      reason: 'starting',
      text: trimmedText,
    };
  }

  if (isRecording || isMediaRecorderStateActive(recorderState)) {
    return {
      allowed: false,
      message: 'Stop recording before listening in Spanish.',
      reason: 'recording',
      text: trimmedText,
    };
  }

  return {
    allowed: true,
    message: '',
    reason: 'ready',
    text: trimmedText,
  };
}

export function isExpectedSpeechSynthesisError(error) {
  const errorType = typeof error === 'string'
    ? error
    : error?.error || error?.name || '';

  switch (String(errorType).trim().toLowerCase()) {
    case 'canceled':
    case 'cancelled':
    case 'interrupted':
      return true;
    default:
      return false;
  }
}

export function shouldStoreCompletedRecording({
  chunkCount = 0,
  shouldDiscard = false,
  isMounted = true,
  hasUrlSupport = true,
}) {
  return chunkCount > 0 && !shouldDiscard && isMounted && hasUrlSupport;
}

export function getVoicePracticeCapabilities(environment = {}) {
  const mediaDevices = environment.mediaDevices || {};
  const speechSynthesisSupported = Boolean(environment.speechSynthesis);
  const speechUtteranceSupported = Boolean(environment.SpeechSynthesisUtterance);
  const mediaRecorderSupported = Boolean(environment.MediaRecorder);
  const getUserMediaSupported = typeof mediaDevices.getUserMedia === 'function';

  return {
    speechSynthesisSupported,
    speechUtteranceSupported,
    mediaRecorderSupported,
    getUserMediaSupported,
    ttsSupported: speechSynthesisSupported && speechUtteranceSupported,
    recordingSupported: mediaRecorderSupported && getUserMediaSupported,
  };
}

export function getVisibleSpanishContent(card, showAnswer) {
  if (!card) {
    return { text: '', source: null };
  }

  if (card.direction === 'source_to_target') {
    return { text: String(card.prompt || '').trim(), source: 'prompt' };
  }

  if (card.direction === 'target_to_source' && showAnswer) {
    return { text: String(card.answer || '').trim(), source: 'answer' };
  }

  return { text: '', source: null };
}

export function getVoicePracticeSpanishContent({
  card,
  showAnswer,
  isRecording = false,
  isStarting = false,
}) {
  const visibleSpanish = getVisibleSpanishContent(card, showAnswer);
  if (visibleSpanish.text) {
    return visibleSpanish;
  }

  if (card?.direction === 'target_to_source' && (isRecording || isStarting)) {
    return getVisibleSpanishContent(card, true);
  }

  return visibleSpanish;
}

export function shouldStopSpeakingOnCardFlip({
  card,
  showAnswer,
  isSpeaking = false,
}) {
  if (!isSpeaking) {
    return false;
  }

  const nextVisibleSpanish = getVisibleSpanishContent(card, !showAnswer);
  return !nextVisibleSpanish.text;
}

export function getRecordingErrorMessage(error) {
  const name = typeof error === 'string' ? error : error?.name;

  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone access was denied. Allow mic access in your browser to record a private local take.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No microphone was found on this device.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Your microphone is busy or unavailable right now.';
    default:
      return error?.message || 'Recording is not available in this browser.';
  }
}
