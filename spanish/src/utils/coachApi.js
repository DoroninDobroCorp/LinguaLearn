import { getActiveProfileId, getProfilePinToken, profileApiUrl, profileFetch } from './api.js';

export class CoachApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(method, path, body) {
  let response;
  try {
    response = await profileFetch(profileApiUrl(`/spanish/api/coach${path}`), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error?.code) throw error;
    throw new CoachApiError('Нет связи с сервером. Проверьте интернет.', { code: 'NETWORK' });
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new CoachApiError(data?.error || `Ошибка сервера (${response.status})`, { status: response.status, code: data?.code });
  }
  return data;
}

export const coachApi = {
  catalog: () => request('GET', '/catalog'),
  dashboard: () => request('GET', '/dashboard'),
  profile: () => request('GET', '/profile'),
  saveProfile: (patch) => request('PUT', '/profile', patch),
  forgetMemory: (index) => request('DELETE', `/profile/memory/${index}`),
  sessions: () => request('GET', '/sessions'),
  startSession: (payload) => request('POST', '/sessions', payload),
  session: (id) => request('GET', `/sessions/${id}`),
  sendText: (id, text) => request('POST', `/sessions/${id}/messages`, { text }),
  sendAudio: (id, audio, mimeType) => request('POST', `/sessions/${id}/messages`, { audio, mimeType }),
  retryReply: (id) => request('POST', `/sessions/${id}/retry-reply`, {}),
  hint: (id) => request('POST', `/sessions/${id}/hint`, {}),
  finish: (id) => request('POST', `/sessions/${id}/finish`, {}),
  retryAnalysis: (id) => request('POST', `/sessions/${id}/retry-analysis`, {}),
  feedback: (messageId) => request('GET', `/messages/${messageId}/feedback`),
  translate: (messageId) => request('POST', `/messages/${messageId}/translate`, {}),
  spots: () => request('GET', '/spots'),
  spot: (id) => request('GET', `/spots/${id}`),
  lesson: (id) => request('GET', `/spots/${id}/lesson`),
  archiveSpot: (id) => request('POST', `/spots/${id}/archive`, {}),
  createWorkout: (spotKeys) => request('POST', '/workouts', { spotKeys }),
  nextWorkout: () => request('POST', '/workouts/next', {}),
  workout: (id, wait = false) => request('GET', `/workouts/${id}${wait ? '?wait=1' : ''}`),
  answer: (workoutId, itemId, payload) => request('POST', `/workouts/${workoutId}/items/${itemId}/answer`, payload),
};

export async function fetchSpeech(text, { voice, style } = {}) {
  const response = await profileFetch(profileApiUrl('/spanish/api/coach/tts'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice, style }),
  });
  if (!response.ok) throw new CoachApiError('TTS failed', { status: response.status });
  return response.blob();
}

export function coachLiveUrl(sessionId) {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const prefix = window.location.pathname.startsWith('/spanish') ? '/spanish/api/coach/live' : '/api/coach/live';
  const profileId = getActiveProfileId();
  const params = new URLSearchParams({ profileId: String(profileId), sessionId: String(sessionId) });
  const pinToken = getProfilePinToken(profileId);
  if (pinToken) params.set('pinToken', pinToken);
  return `${proto}://${window.location.host}${prefix}?${params.toString()}`;
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Word-level diff for showing exactly what changed in a correction. */
export function diffWords(original, corrected) {
  const tokenize = (text) => String(text || '').split(/(\s+)/).filter((token) => token.length > 0);
  const a = tokenize(original);
  const b = tokenize(corrected);
  const norm = (token) => token.toLowerCase().replace(/[.,!?¡¿;:"«»()]/g, '');
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = Array.from({ length: rows }, () => new Uint16Array(cols));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = norm(a[i]) === norm(b[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (norm(a[i]) === norm(b[j])) {
      out.push({ type: 'same', text: b[j] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ type: 'del', text: a[i] });
      i += 1;
    } else {
      out.push({ type: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) out.push({ type: 'del', text: a[i++] });
  while (j < b.length) out.push({ type: 'add', text: b[j++] });
  return out.filter((part) => !(part.type !== 'same' && /^\s+$/.test(part.text)));
}
