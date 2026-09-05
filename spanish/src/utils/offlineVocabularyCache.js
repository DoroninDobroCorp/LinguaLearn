import { getActiveProfileId } from './api.js';

const DB_NAME = 'lingua_spanish_offline_db';
const DB_VERSION = 2;
const STORE_VOCABULARY = 'vocabulary';
const STORE_SESSIONS = 'study_sessions';

let memoryCache = {
  profileId: null,
  data: null,
};

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not available'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_VOCABULARY)) {
        db.createObjectStore(STORE_VOCABULARY, { keyPath: 'profileId' });
      }
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function readOfflineVocabularyCacheSync(profileId = getActiveProfileId()) {
  if (memoryCache.profileId === profileId && memoryCache.data) {
    return memoryCache.data;
  }

  // Check localStorage as fast fallback for small profiles
  try {
    const raw = localStorage.getItem(`spanishOfflineVocabulary:v1:profile:${profileId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.entries)) {
        memoryCache = { profileId, data: parsed };
        return parsed;
      }
    }
  } catch {}

  return null;
}

export const readOfflineVocabularyCache = readOfflineVocabularyCacheSync;

export async function readOfflineVocabularyCacheAsync(profileId = getActiveProfileId()) {
  // 1. Check memory cache first
  if (memoryCache.profileId === profileId && memoryCache.data) {
    return memoryCache.data;
  }

  // 2. Check IndexedDB
  try {
    const db = await openDatabase();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_VOCABULARY, 'readonly');
      const store = tx.objectStore(STORE_VOCABULARY);
      const req = store.get(profileId);

      req.onsuccess = () => {
        if (req.result && Array.isArray(req.result.entries)) {
          memoryCache = { profileId, data: req.result };
          resolve(req.result);
        } else {
          // Fallback to sync/localStorage
          resolve(readOfflineVocabularyCacheSync(profileId));
        }
      };

      req.onerror = () => {
        resolve(readOfflineVocabularyCacheSync(profileId));
      };
    });
  } catch {
    return readOfflineVocabularyCacheSync(profileId);
  }
}

export function writeOfflineVocabularyCache({
  entries = [],
  stats = null,
  queueStats = null,
  groups = [],
  profileId = getActiveProfileId(),
} = {}) {
  const payload = {
    profileId,
    entries,
    stats,
    queueStats,
    groups,
    cachedAt: new Date().toISOString(),
  };

  // 1. Always update fast memory cache
  memoryCache = { profileId, data: payload };

  // 2. Persist to native IndexedDB (hundreds of MBs capacity on iOS/Safari)
  openDatabase()
    .then((db) => {
      const tx = db.transaction(STORE_VOCABULARY, 'readwrite');
      const store = tx.objectStore(STORE_VOCABULARY);
      store.put(payload);
    })
    .catch((err) => {
      console.warn('[OfflineCache] IndexedDB write failed:', err);
    });

  // 3. Attempt localStorage write (will gracefully be ignored if exceeds 5MB limit)
  try {
    localStorage.setItem(`spanishOfflineVocabulary:v1:profile:${profileId}`, JSON.stringify(payload));
  } catch {}

  return payload;
}

export async function saveOfflineStudySession(mode, session, currentCard, profileId = getActiveProfileId()) {
  if (!mode) return;
  const id = `session_${profileId}_${mode}`;
  const record = {
    id,
    profileId,
    mode,
    session,
    currentCard,
    updatedAt: new Date().toISOString(),
  };

  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_SESSIONS, 'readwrite');
    tx.objectStore(STORE_SESSIONS).put(record);
  } catch (err) {
    try {
      localStorage.setItem(`lingua_offline_session_${id}`, JSON.stringify(record));
    } catch {}
  }
}

export async function loadOfflineStudySession(mode, profileId = getActiveProfileId()) {
  if (!mode) return null;
  const id = `session_${profileId}_${mode}`;

  try {
    const db = await openDatabase();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_SESSIONS, 'readonly');
      const req = tx.objectStore(STORE_SESSIONS).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    try {
      const raw = localStorage.getItem(`lingua_offline_session_${id}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

export function formatOfflineCacheTime(value) {
  if (!value) {
    return 'недавнего времени';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'недавнего времени';
  }

  return date.toLocaleString();
}
