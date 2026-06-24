import { getActiveProfileId } from './api';

const CACHE_VERSION = 1;
const CACHE_PREFIX = 'spanishOfflineVocabulary';

function buildCacheKey(profileId = getActiveProfileId()) {
  return `${CACHE_PREFIX}:v${CACHE_VERSION}:profile:${profileId}`;
}

export function readOfflineVocabularyCache(profileId = getActiveProfileId()) {
  try {
    const raw = localStorage.getItem(buildCacheKey(profileId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.entries)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeOfflineVocabularyCache({
  entries = [],
  stats = null,
  queueStats = null,
  profileId = getActiveProfileId(),
} = {}) {
  const payload = {
    version: CACHE_VERSION,
    profileId,
    entries,
    stats,
    queueStats,
    cachedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(buildCacheKey(profileId), JSON.stringify(payload));
  } catch {
    // Safari private/low-storage modes can reject writes. Online behavior should continue.
  }

  return payload;
}

export function formatOfflineCacheTime(value) {
  if (!value) {
    return 'unknown time';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'unknown time';
  }

  return date.toLocaleString();
}
