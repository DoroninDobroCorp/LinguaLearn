const PROFILE_STORAGE_KEY = 'spanishActiveProfileId';
const PROFILE_PIN_TOKEN_PREFIX = 'spanishProfilePinToken:';
const PROFILE_ACTIVE_TOKEN_PREFIX = 'spanishActiveProfileToken:';
export const PROFILE_RESET_EVENT = 'lingualearn-profile-reset';
export const ACTIVE_PROFILE_TOKEN_HEADER = 'x-active-profile-token';
export const PROFILE_UNLOCK_TOKEN_HEADER = 'x-profile-pin-token';

function parseJsonResponse(rawText) {
  if (!String(rawText || '').trim()) {
    return { hasJson: false, data: null };
  }

  try {
    return { hasJson: true, data: JSON.parse(rawText) };
  } catch {
    return { hasJson: false, data: null };
  }
}

async function readJsonResponse(response) {
  const { hasJson, data } = parseJsonResponse(await response.text());
  return {
    response,
    hasJson,
    data: hasJson && data !== null ? data : {},
  };
}

export async function fetchJsonWithFallback(primaryInput, fallbackInput, init) {
  const primaryResult = await readJsonResponse(await fetch(primaryInput, init));
  if (primaryResult.hasJson) {
    return primaryResult;
  }

  const fallbackResult = await readJsonResponse(await fetch(fallbackInput, init));
  return fallbackResult;
}

export function getActiveProfileId() {
  if (typeof window !== 'undefined' && window.location && window.location.search) {
    try {
      const params = new URLSearchParams(window.location.search);
      const student = params.get('student') || params.get('profile') || params.get('profileId') || params.get('studentId');
      if (student) {
        const sLower = String(student).toLowerCase().trim();
        if (sLower === 'maya' || sLower === 'майя' || sLower === '9') {
          localStorage.setItem(PROFILE_STORAGE_KEY, '9');
          sessionStorage.setItem('studentToken', 'maya');
          sessionStorage.setItem('studentProfileId', '9');
          return 9;
        }
        const num = parseInt(student, 10);
        if (Number.isFinite(num) && num > 0) {
          localStorage.setItem(PROFILE_STORAGE_KEY, String(num));
          sessionStorage.setItem('studentProfileId', String(num));
          return num;
        }
      }
    } catch {}
  }

  // Also check if we saved student session in sessionStorage
  if (typeof window !== 'undefined') {
    try {
      const sessionStudent = sessionStorage.getItem('studentToken');
      if (sessionStudent) {
        const sLower = sessionStudent.toLowerCase().trim();
        if (sLower === 'maya' || sLower === 'майя') return 9;
      }
      const sessionPid = Number(sessionStorage.getItem('studentProfileId'));
      if (Number.isFinite(sessionPid) && sessionPid > 0) {
        return sessionPid;
      }
    } catch {}
  }

  const stored = localStorage.getItem(PROFILE_STORAGE_KEY);
  const id = Number(stored);
  return Number.isFinite(id) && id > 0 ? id : 1;
}

export function getStudentSessionId() {
  if (typeof window === 'undefined') return 'server_session';
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('session') || params.get('sessionId');
    if (fromUrl) {
      sessionStorage.setItem('studentSessionId', fromUrl);
      return fromUrl;
    }
    let existing = sessionStorage.getItem('studentSessionId');
    if (!existing) {
      existing = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      sessionStorage.setItem('studentSessionId', existing);
    }
    return existing;
  } catch {
    return 'default_session';
  }
}

export function getStudentToken() {
  if (typeof window === 'undefined') return '';
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('token') || params.get('student');
    if (fromUrl) {
      sessionStorage.setItem('studentToken', fromUrl);
      return fromUrl;
    }
    return sessionStorage.getItem('studentToken') || '';
  } catch {
    return '';
  }
}

export function setActiveProfileId(id) {
  localStorage.setItem(PROFILE_STORAGE_KEY, String(id));
}

export function getProfilePinToken(profileId = getActiveProfileId()) {
  return sessionStorage.getItem(`${PROFILE_PIN_TOKEN_PREFIX}${profileId}`) || '';
}

export function setProfilePinToken(profileId, token) {
  if (!token) {
    sessionStorage.removeItem(`${PROFILE_PIN_TOKEN_PREFIX}${profileId}`);
    return;
  }

  sessionStorage.setItem(`${PROFILE_PIN_TOKEN_PREFIX}${profileId}`, token);
}

export function clearProfilePinToken(profileId) {
  sessionStorage.removeItem(`${PROFILE_PIN_TOKEN_PREFIX}${profileId}`);
}

export function hasProfilePinToken(profileId) {
  return Boolean(getProfilePinToken(profileId));
}

export function getActiveProfileToken(profileId = getActiveProfileId()) {
  return sessionStorage.getItem(`${PROFILE_ACTIVE_TOKEN_PREFIX}${profileId}`) || '';
}

export function setActiveProfileToken(profileId, token) {
  if (!token) {
    sessionStorage.removeItem(`${PROFILE_ACTIVE_TOKEN_PREFIX}${profileId}`);
    return;
  }

  sessionStorage.setItem(`${PROFILE_ACTIVE_TOKEN_PREFIX}${profileId}`, token);
}

export function clearActiveProfileToken(profileId) {
  sessionStorage.removeItem(`${PROFILE_ACTIVE_TOKEN_PREFIX}${profileId}`);
}

/**
 * Append ?profileId=<id> (or &profileId=<id>) to any API URL.
 * Reads the active profile from localStorage so it works without React context.
 */
export function profileApiUrl(path) {
  const profileId = getActiveProfileId();
  const sep = path.includes('?') ? '&' : '?';
  const student = getStudentToken();
  const studentQuery = student ? `&student=${encodeURIComponent(student)}` : '';
  return `${path}${sep}profileId=${profileId}${studentQuery}`;
}

const PENDING_STUDENT_LOGS_KEY = 'pendingStudentLogsQueue';
let isFlushingStudentLogs = false;

export function queuePendingStudentLog(payload) {
  try {
    const raw = localStorage.getItem(PENDING_STUDENT_LOGS_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    // Ensure item has clientEventId
    if (!payload.clientEventId) {
      payload.clientEventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    // Avoid exact duplicate clientEventId in the queue
    if (!queue.some(q => q.clientEventId === payload.clientEventId)) {
      queue.push(payload);
    }
    if (queue.length > 500) queue.shift();
    localStorage.setItem(PENDING_STUDENT_LOGS_KEY, JSON.stringify(queue));
  } catch {}
}

export async function flushPendingStudentLogs() {
  if (typeof window === 'undefined' || isFlushingStudentLogs) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  isFlushingStudentLogs = true;
  try {
    const raw = localStorage.getItem(PENDING_STUDENT_LOGS_KEY);
    if (!raw) return;
    const queue = JSON.parse(raw);
    if (!Array.isArray(queue) || queue.length === 0) return;

    const remaining = [];
    let serverUnavailable = false;

    for (const item of queue) {
      if (serverUnavailable) {
        remaining.push(item);
        continue;
      }

      try {
        const res = await fetch(profileApiUrl('/spanish/api/vocabulary/log-attempt'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });

        if (!res.ok) {
          // If server error (5xx) or rate limit (429), retain in queue and pause flushing
          if (res.status >= 500 || res.status === 429) {
            serverUnavailable = true;
            remaining.push(item);
          }
          // 4xx client errors are discarded (not re-queued) to avoid poison pill loops
        }
      } catch {
        serverUnavailable = true;
        remaining.push(item);
      }
    }

    if (remaining.length > 0) {
      localStorage.setItem(PENDING_STUDENT_LOGS_KEY, JSON.stringify(remaining));
    } else {
      localStorage.removeItem(PENDING_STUDENT_LOGS_KEY);
    }
  } catch {} finally {
    isFlushingStudentLogs = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', flushPendingStudentLogs);
}

/**
 * Log a student vocabulary review attempt reliably to the server backend.
 * Resilient against temporary offline or network hiccups via background retry queue and clientEventId deduplication.
 */
export async function logVocabularyAttempt(logData) {
  try {
    const profileId = getActiveProfileId();
    const sessionId = getStudentSessionId();
    const studentToken = getStudentToken();
    const clientEventId = logData.clientEventId || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const payload = {
      clientEventId,
      profileId,
      sessionId,
      studentToken,
      ...logData,
      createdAt: logData.createdAt || new Date().toISOString()
    };

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      queuePendingStudentLog(payload);
      return;
    }

    try {
      const res = await fetch(profileApiUrl('/spanish/api/vocabulary/log-attempt'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        if (res.status >= 500 || res.status === 429) {
          queuePendingStudentLog(payload);
        }
      } else {
        // Trigger background flush of any previously queued items
        flushPendingStudentLogs();
      }
    } catch {
      queuePendingStudentLog(payload);
    }
  } catch (err) {
    console.warn('Error queuing vocabulary attempt log:', err);
  }
}

/**
 * Fetch wrapper that detects stale/deleted profile errors from the API.
 * On PROFILE_NOT_FOUND / INVALID_PROFILE_ID it resets localStorage to the
 * default profile and dispatches a global event so ProfileContext can reload.
 */
export async function profileFetch(input, init) {
  const activeProfileId = getActiveProfileId();
  const headers = new Headers(init?.headers || {});
  const pinToken = getProfilePinToken(activeProfileId);
  if (pinToken) {
    headers.set(PROFILE_UNLOCK_TOKEN_HEADER, pinToken);
  }

  const activeProfileToken = getActiveProfileToken(activeProfileId);
  if (activeProfileToken) {
    headers.set(ACTIVE_PROFILE_TOKEN_HEADER, activeProfileToken);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.status === 404 || response.status === 400 || response.status === 423) {
    try {
      const data = await response.clone().json();
      if (data.code === 'PROFILE_NOT_FOUND' || data.code === 'INVALID_PROFILE_ID') {
        setActiveProfileId(1);
        window.dispatchEvent(new CustomEvent(PROFILE_RESET_EVENT, { detail: data }));
        const err = new Error(data.error || 'Profile not found');
        err.code = data.code;
        throw err;
      }
      if (data.code === 'PROFILE_LOCKED') {
        clearProfilePinToken(activeProfileId);
        clearActiveProfileToken(activeProfileId);
        window.dispatchEvent(new CustomEvent(PROFILE_RESET_EVENT, { detail: data }));
        const err = new Error(data.error || 'Profile is locked');
        err.code = data.code;
        throw err;
      }
    } catch (e) {
      if (e.code === 'PROFILE_NOT_FOUND' || e.code === 'INVALID_PROFILE_ID' || e.code === 'PROFILE_LOCKED') throw e;
    }
  }

  return response;
}

/**
 * Safely resolves media asset paths (audio, webp, etc.) for both direct dev and /spanish/ production base URL.
 */
export function getAssetUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:') || path.startsWith('data:')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (cleanPath.startsWith('/spanish/')) {
    return cleanPath;
  }
  return `/spanish${cleanPath}`;
}
