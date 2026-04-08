const PROFILE_STORAGE_KEY = 'spanishActiveProfileId';
const PROFILE_PIN_TOKEN_PREFIX = 'spanishProfilePinToken:';
const PROFILE_ACTIVE_TOKEN_PREFIX = 'spanishActiveProfileToken:';
export const PROFILE_RESET_EVENT = 'lingualearn-profile-reset';
export const ACTIVE_PROFILE_TOKEN_HEADER = 'x-active-profile-token';
export const PROFILE_UNLOCK_TOKEN_HEADER = 'x-profile-pin-token';

export function getActiveProfileId() {
  const stored = localStorage.getItem(PROFILE_STORAGE_KEY);
  const id = Number(stored);
  return Number.isFinite(id) && id > 0 ? id : 1;
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
  return `${path}${sep}profileId=${profileId}`;
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
