import { useCallback, useEffect, useState } from 'react';
import { fetchSpeech } from '../utils/coachApi';
import { speakSpanish } from '../utils/soundEffects';

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

export async function playCoachSpeech(text, { key = text, voice, style } = {}) {
  const spoken = String(text || '').trim();
  if (!spoken) return;
  const audio = getAudio();
  stopCoachSpeech();
  setCurrent({ key, status: 'loading' });
  const cacheKey = `${voice || ''}|${style || ''}|${spoken}`;
  try {
    let url = urlCache.get(cacheKey);
    if (!url) {
      const blob = await fetchSpeech(spoken, { voice, style });
      url = URL.createObjectURL(blob);
      urlCache.set(cacheKey, url);
    }
    if (current.key !== key) return; // Another play/stop happened meanwhile.
    audio.src = url;
    setCurrent({ key, status: 'playing' });
    await audio.play();
  } catch {
    if (current.key !== key) return;
    // Server TTS unavailable or autoplay blocked: fall back to the browser voice.
    const started = speakSpanish(spoken, 'es-AR');
    setCurrent({ key: started ? key : null, status: started ? 'playing' : 'idle' });
    if (started && window.speechSynthesis) {
      const poll = setInterval(() => {
        if (!window.speechSynthesis.speaking) {
          clearInterval(poll);
          if (current.key === key) setCurrent({ key: null, status: 'idle' });
        }
      }, 300);
    }
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
