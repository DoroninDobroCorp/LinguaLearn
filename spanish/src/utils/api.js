const PROFILE_STORAGE_KEY = 'spanishActiveProfileId';

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
