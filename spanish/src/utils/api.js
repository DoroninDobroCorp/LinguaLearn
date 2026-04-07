const PROFILE_STORAGE_KEY = 'spanishActiveProfileId';
export const PROFILE_RESET_EVENT = 'lingualearn-profile-reset';

export function getActiveProfileId() {
  const stored = localStorage.getItem(PROFILE_STORAGE_KEY);
  const id = Number(stored);
  return Number.isFinite(id) && id > 0 ? id : 1;
}

export function setActiveProfileId(id) {
  localStorage.setItem(PROFILE_STORAGE_KEY, String(id));
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
  const response = await fetch(input, init);

  if (response.status === 404 || response.status === 400) {
    try {
      const data = await response.clone().json();
      if (data.code === 'PROFILE_NOT_FOUND' || data.code === 'INVALID_PROFILE_ID') {
        setActiveProfileId(1);
        window.dispatchEvent(new CustomEvent(PROFILE_RESET_EVENT, { detail: data }));
        const err = new Error(data.error || 'Profile not found');
        err.code = data.code;
        throw err;
      }
    } catch (e) {
      if (e.code === 'PROFILE_NOT_FOUND' || e.code === 'INVALID_PROFILE_ID') throw e;
    }
  }

  return response;
}
