import { useCallback, useEffect, useState } from 'react';
import { fetchSpeech } from '../utils/coachApi';

// One shared <audio> element: iOS only lets JS start playback on an element
// that was first played inside a user gesture, so we "unlock" it once and
// reuse it for every reply that arrives asynchronously afterwards.
let sharedAudio = null;
let unlocked = false;
const urlCache = new Map();
const listeners = new Set();
let current = { key: null, status: 'idle' };

const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

function getAudio() {
  if (!sharedAudio && typeof Audio !== 'undefined') {
    sharedAudio = new Audio();
    sharedAudio.preload = 'auto';
    sharedAudio.addEventListener('ended', () => setCurrent({ key: null, status: 'idle' }));
    sharedAudio.addEventListener('error', () => {
      if (current.status === 'playing') setCurrent({ key: null, status: 'idle' });
    });
  }
  return sharedAudio;
}

function setCurrent(next) {
  current = next;
  listeners.forEach((listener) => listener(next));
}

export function unlockCoachAudio() {
  if (unlocked) return;
  const audio = getAudio();
  if (!audio) return;
  unlocked = true;
  try {
    audio.src = SILENT_WAV;
    const attempt = audio.play();
    if (attempt?.catch) attempt.catch(() => { unlocked = false; });
  } catch {
    unlocked = false;
  }
}

export function stopCoachSpeech() {
  const audio = getAudio();
  if (audio) {
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // Ignore.
    }
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
  setCurrent({ key: null, status: 'idle' });
}

const FEMALE_VOICE = /(paulina|m[oó]nica|luciana|isabela|marisol|soledad|ang[eé]lica|juana|francisca|esperanza|elvira|helena|laura|lupe|sabina|google español|female|mujer)/i;
const MALE_VOICE = /(diego|jorge|juan|carlos|andr[eé]s|enrique|pablo|[aá]lvaro|alberto|eddy|reed|rocko|grandpa|male|hombre)/i;

/** Browser fallback voice: the partners are women by default, so avoid male system voices. */
function pickFallbackVoice() {
  const voices = (window.speechSynthesis?.getVoices?.() || []).filter((item) => /^es/i.test(item.lang));
  const female = voices.filter((item) => FEMALE_VOICE.test(item.name) && !MALE_VOICE.test(item.name));
  const neutral = voices.filter((item) => !MALE_VOICE.test(item.name));
  const byLocale = (list) => list.find((item) => /es[-_]AR/i.test(item.lang))
    || list.find((item) => /es[-_](US|MX|419)/i.test(item.lang))
    || list[0];
  return byLocale(female) || byLocale(neutral) || null;
}

function speakWithBrowser(text, key) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return false;
  const voice = pickFallbackVoice();
  if (!voice) return false; // Better silence than a male robot standing in for Lucía.
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.rate = 0.95;
  utterance.onend = () => {
    if (current.key === key) setCurrent({ key: null, status: 'idle' });
  };
  utterance.onerror = utterance.onend;
  synth.cancel();
  synth.speak(utterance);
  return true;
}

async function fetchSpeechWithRetry(text, options) {
  // A deploy restarts the backend for a couple of seconds; retry before giving up.
  const delays = [0, 1200, 2500];
  let lastError;
  for (const delay of delays) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      return await fetchSpeech(text, options);
    } catch (error) {
      lastError = error;
      if (error?.status && error.status < 500 && error.status !== 429) break;
    }
  }
  throw lastError;
}

/**
 * Play a line in the partner's server voice. Autoplay never switches to a
 * different (browser) voice: if the server can't speak, the line stays silent.
 */
export async function playCoachSpeech(text, { key = text, voice, style, allowBrowserFallback = true } = {}) {
  const spoken = String(text || '').trim();
  if (!spoken) return;
  const audio = getAudio();
  stopCoachSpeech();
  setCurrent({ key, status: 'loading' });
  const cacheKey = `${voice || ''}|${style || ''}|${spoken}`;
  let url = urlCache.get(cacheKey);
  try {
    if (!url) {
      const blob = await fetchSpeechWithRetry(spoken, { voice, style });
      url = URL.createObjectURL(blob);
      urlCache.set(cacheKey, url);
    }
  } catch {
    if (current.key !== key) return;
    const started = allowBrowserFallback && speakWithBrowser(spoken, key);
    setCurrent({ key: started ? key : null, status: started ? 'playing' : 'idle' });
    return;
  }
  if (current.key !== key) return; // Another play/stop happened meanwhile.
  try {
    audio.src = url;
    setCurrent({ key, status: 'playing' });
    await audio.play();
  } catch {
    // Autoplay blocked by the browser: the audio is ready, a tap on "Слушать" plays it.
    if (current.key === key) setCurrent({ key: null, status: 'idle' });
  }
}

export function useCoachSpeech() {
  const [state, setState] = useState(current);
  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  useEffect(() => () => stopCoachSpeech(), []);
  const play = useCallback((text, options) => playCoachSpeech(text, options), []);
  return { playingKey: state.key, status: state.status, play, stop: stopCoachSpeech, unlock: unlockCoachAudio };
}
